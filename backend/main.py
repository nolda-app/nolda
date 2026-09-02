from fastapi import FastAPI

app = FastAPI(title="NOLDA API")


@app.get("/health")
def health():
    return {"status": "ok"}
