import json
import os
from datetime import datetime, timezone, date
from typing import Annotated, Optional
from uuid import uuid4

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, StreamingResponse
from langchain_community.tools.tavily_search import TavilySearchResults
from langchain_core.messages import AIMessageChunk, HumanMessage, ToolMessage
from langchain_openai import ChatOpenAI
from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import END, StateGraph, add_messages
from typing_extensions import TypedDict
from dotenv import load_dotenv

from database import Conversation, create_tables, get_db
from logging_config import log_requests, setup_logging

load_dotenv()

logger = setup_logging()

# ---------------------------------------------------------------------------
# LangGraph setup
# ---------------------------------------------------------------------------

memory = MemorySaver()


class State(TypedDict):
    messages: Annotated[list, add_messages]


search_tool = TavilySearchResults(max_results=4)
tools = [search_tool]

llm = ChatOpenAI(model="gpt-4o")
llm_with_tools = llm.bind_tools(tools=tools)


def build_system_prompt() -> str:
    """
    Constructs a system prompt with real-time context injected at call time.
    Called fresh on every model invocation so the date/time is always current.
    """
    now = datetime.now(timezone.utc)
    return (
        f"You are Inquiro, an intelligent research assistant with access to web search.\n\n"
        f"CURRENT CONTEXT:\n"
        f"- Today's date: {date.today().strftime('%B %d, %Y')}\n"
        f"- Current UTC time: {now.strftime('%H:%M')}\n\n"
        f"SEARCH TOOL USAGE:\n"
        f"- Use the search tool for: current events, live data (weather, stocks, sports), "
        f"recent news, or anything that changes over time.\n"
        f"- Do NOT search for: timeless facts, math, definitions, or general knowledge "
        f"that does not change (e.g. 'what is photosynthesis').\n\n"
        f"RESPONSE GUIDELINES:\n"
        f"- Be concise and direct. Avoid unnecessary filler phrases.\n"
        f"- When you use search results, cite the sources naturally in your answer.\n"
        f"- Format responses with markdown where it improves readability.\n"
        f"- Never introduce yourself as ChatGPT or any other assistant."
    )


async def model(state: State):
    from langchain_core.messages import SystemMessage
    system = SystemMessage(content=build_system_prompt())
    result = await llm_with_tools.ainvoke([system] + state["messages"])
    return {"messages": [result]}


async def tools_router(state: State):
    last_message = state["messages"][-1]
    if hasattr(last_message, "tool_calls") and len(last_message.tool_calls) > 0:
        return "tool_node"
    return END


async def tool_node(state: State):
    """Execute tool calls requested by the LLM and return ToolMessages."""
    tool_calls = state["messages"][-1].tool_calls
    tool_messages = []

    for tool_call in tool_calls:
        if tool_call["name"] == "tavily_search_results_json":
            search_results = await search_tool.ainvoke(tool_call["args"])
            tool_messages.append(
                ToolMessage(
                    content=str(search_results),
                    tool_call_id=tool_call["id"],
                    name=tool_call["name"],
                )
            )

    return {"messages": tool_messages}


graph_builder = StateGraph(State)
graph_builder.add_node("model", model)
graph_builder.add_node("tool_node", tool_node)
graph_builder.set_entry_point("model")
graph_builder.add_conditional_edges("model", tools_router)
graph_builder.add_edge("tool_node", "model")
graph = graph_builder.compile(checkpointer=memory)

# ---------------------------------------------------------------------------
# FastAPI setup
# ---------------------------------------------------------------------------

app = FastAPI(title="Inquiro API", version="1.0.0")

# Tighten CORS: read allowed origins from env, default to localhost for dev.
# In production set ALLOWED_ORIGINS=https://yourdomain.com
allowed_origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Type"],
)

app.middleware("http")(log_requests)


@app.on_event("startup")
def on_startup():
    create_tables()
    logger.info("Database tables ready")


# ---------------------------------------------------------------------------
# Health endpoint (used by Docker healthcheck and K8s readiness probe)
# ---------------------------------------------------------------------------

@app.get("/health")
async def health():
    return {
        "status": "ok",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "version": "1.0.0",
    }


# ---------------------------------------------------------------------------
# Conversations endpoints (power the sidebar)
# ---------------------------------------------------------------------------

@app.get("/conversations")
async def list_conversations():
    """Return all conversations ordered by most recently updated, limit 50."""
    db = next(get_db())
    convs = (
        db.query(Conversation)
        .order_by(Conversation.updated_at.desc())
        .limit(50)
        .all()
    )
    return [
        {
            "thread_id": c.thread_id,
            "title": c.title,
            "created_at": c.created_at.isoformat(),
            "updated_at": c.updated_at.isoformat(),
        }
        for c in convs
    ]


@app.get("/conversations/{thread_id}")
async def get_conversation(thread_id: str):
    db = next(get_db())
    conv = db.get(Conversation, thread_id)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return {
        "thread_id": conv.thread_id,
        "title": conv.title,
        "created_at": conv.created_at.isoformat(),
        "updated_at": conv.updated_at.isoformat(),
    }


@app.delete("/conversations/{thread_id}", status_code=204)
async def delete_conversation(thread_id: str):
    db = next(get_db())
    conv = db.get(Conversation, thread_id)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    db.delete(conv)
    db.commit()
    return Response(status_code=204)


# ---------------------------------------------------------------------------
# Chat stream endpoint
# ---------------------------------------------------------------------------

def serialise_ai_message_chunk(chunk) -> str:
    if isinstance(chunk, AIMessageChunk):
        return chunk.content
    raise TypeError(
        f"Object of type {type(chunk).__name__} is not correctly formatted for serialisation"
    )


async def generate_chat_responses(message: str, checkpoint_id: Optional[str] = None):
    is_new_conversation = checkpoint_id is None

    if is_new_conversation:
        new_checkpoint_id = str(uuid4())
        config = {"configurable": {"thread_id": new_checkpoint_id}}

        events = graph.astream_events(
            {"messages": [HumanMessage(content=message)]},
            version="v2",
            config=config,
        )

        yield f"data: {json.dumps({'type': 'checkpoint', 'checkpoint_id': new_checkpoint_id})}\n\n"

        # Persist new conversation to SQLite
        db = next(get_db())
        try:
            db.add(
                Conversation(
                    thread_id=new_checkpoint_id,
                    title=message[:80],
                )
            )
            db.commit()
        finally:
            db.close()

        active_checkpoint_id = new_checkpoint_id
    else:
        config = {"configurable": {"thread_id": checkpoint_id}}
        events = graph.astream_events(
            {"messages": [HumanMessage(content=message)]},
            version="v2",
            config=config,
        )
        active_checkpoint_id = checkpoint_id

    async for event in events:
        event_type = event["event"]

        if event_type == "on_chat_model_stream":
            chunk_content = serialise_ai_message_chunk(event["data"]["chunk"])
            yield f"data: {json.dumps({'type': 'content', 'content': chunk_content})}\n\n"

        elif event_type == "on_chat_model_end":
            tool_calls = (
                event["data"]["output"].tool_calls
                if hasattr(event["data"]["output"], "tool_calls")
                else []
            )
            search_calls = [
                c for c in tool_calls if c["name"] == "tavily_search_results_json"
            ]
            if search_calls:
                search_query = search_calls[0]["args"].get("query", "")
                yield f"data: {json.dumps({'type': 'search_start', 'query': search_query})}\n\n"

        elif event_type == "on_tool_end" and event["name"] == "tavily_search_results_json":
            output = event["data"]["output"]
            if isinstance(output, list):
                urls = [item["url"] for item in output if isinstance(item, dict) and "url" in item]
                yield f"data: {json.dumps({'type': 'search_results', 'urls': urls})}\n\n"

    # Update updated_at for existing conversations so sidebar order refreshes
    if not is_new_conversation:
        db = next(get_db())
        try:
            conv = db.get(Conversation, active_checkpoint_id)
            if conv:
                conv.updated_at = datetime.now(timezone.utc)
                db.commit()
        finally:
            db.close()

    yield f"data: {json.dumps({'type': 'end'})}\n\n"


@app.get("/chat_stream/{message}")
async def chat_stream(message: str, checkpoint_id: Optional[str] = Query(None)):
    return StreamingResponse(
        generate_chat_responses(message, checkpoint_id),
        media_type="text/event-stream",
    )
