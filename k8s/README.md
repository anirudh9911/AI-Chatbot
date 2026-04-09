# Kubernetes — Local Setup with Kind

Kind (Kubernetes IN Docker) runs a real Kubernetes cluster on your laptop inside Docker containers. No cloud account needed.

## Prerequisites

```bash
brew install kind kubectl
```

Docker must be running.

---

## Directory Structure

```
k8s/
├── namespace.yaml          # inquiro namespace (apply first)
├── configmap.yaml          # non-secret env vars
├── pvc.yaml                # 1Gi PersistentVolumeClaim for SQLite
├── server-deployment.yaml  # FastAPI server (readiness + liveness probes)
├── server-service.yaml     # ClusterIP — internal only
├── client-deployment.yaml  # Next.js client
├── client-service.yaml     # NodePort 30000 → localhost:3000
├── templates/
│   └── secret.yaml         # Template only — never apply directly
├── setup-secrets.sh        # Creates real secret from server/.env
├── load-images.sh          # Builds + loads Docker images into Kind
└── README.md
```

> `secret.yaml` in `templates/` is a reference template. Real secrets are created via `setup-secrets.sh` which reads from `server/.env`.

---

## Full Setup (run once)

```bash
# 1. Create the Kind cluster (port mapping: localhost:3000 → NodePort 30000)
kind create cluster --config kind-config.yaml

# 2. Build Docker images and load them into Kind
bash k8s/load-images.sh

# 3. Apply all manifests (excludes templates/)
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/configmap.yaml
kubectl apply -f k8s/pvc.yaml
kubectl apply -f k8s/server-deployment.yaml
kubectl apply -f k8s/server-service.yaml
kubectl apply -f k8s/client-deployment.yaml
kubectl apply -f k8s/client-service.yaml

# 4. Apply real API key secrets (reads from server/.env)
bash k8s/setup-secrets.sh
```

---

## Accessing the App

The client is accessible at **http://localhost:3000** immediately after setup.

The server is ClusterIP (internal only). Expose it to the browser for SSE streaming:

```bash
# Run in a separate terminal — keep it open while using the app
kubectl port-forward svc/server-svc 8000:8000 -n inquiro
```

---

## Verify Pods Are Running

```bash
kubectl get pods -n inquiro
```

Expected output:
```
NAME                      READY   STATUS    RESTARTS
client-xxxx               1/1     Running   0
server-xxxx               1/1     Running   0
```

---

## Useful Commands

```bash
# View logs
kubectl logs -l app=server -n inquiro
kubectl logs -l app=client -n inquiro

# Describe a pod (for debugging)
kubectl describe pod -l app=server -n inquiro

# Reload images after a code change
bash k8s/load-images.sh
kubectl rollout restart deployment/server -n inquiro
kubectl rollout restart deployment/client -n inquiro
```

---

## Teardown

```bash
kind delete cluster --name inquiro-cluster
```

---

## OpenShift Note

On OpenShift, replace `client-service.yaml` NodePort with a `Route` object:

```yaml
apiVersion: route.openshift.io/v1
kind: Route
metadata:
  name: client-route
  namespace: inquiro
spec:
  to:
    kind: Service
    name: client-svc
  port:
    targetPort: 3000
```

Everything else (deployments, configmap, secrets, PVC) is identical.
