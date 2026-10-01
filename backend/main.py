from fastapi import FastAPI, Depends, HTTPException
from supabase import Client
from supabase_client import get_supabase, SUPABASE_URL

app = FastAPI()


@app.get("/")
def read_root():
    return {
        "status": "AI Trainer API online",
        "supabase_configured": bool(SUPABASE_URL),
    }


@app.get("/supabase-status")
def check_supabase_status(db: Client = Depends(get_supabase)):
    try:
        return {"status": "connected", "supabase_url": SUPABASE_URL}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))