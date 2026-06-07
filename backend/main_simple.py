"""
FastAPI app simplificado para debug
Remove complexidade: sem banco de dados, sem frontend
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(
    title="OrthoClinic Debug",
    description="Versao simplificada para debug",
    version="2.0.0-debug"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
def health():
    return {
        "status": "ok",
        "app": "OrthoClinic",
        "version": "2.0.0",
        "mode": "debug"
    }

@app.get("/")
def root():
    return {"message": "OrthoClinic API is running (debug mode)"}

@app.get("/api/test")
def test():
    return {"test": "ok", "database": "disabled in debug mode"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
