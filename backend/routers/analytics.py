"""Analytics Dashboard API endpoints"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import desc, and_, func
from datetime import datetime, date, timedelta
from typing import List, Optional
import json
from io import BytesIO
from decimal import Decimal

from database import get_db
from models import (
    Portfolio, Asset, Transaction, PortfolioPerformanceSnapshot,
    AssetAllocation, Benchmark, BenchmarkPerformance, TaxLot,
    CapitalGainsReport, PortfolioRebalancingRecommendation, Clinic
)
from schemas.analytics import (
    PortfolioResponse, PortfolioCreate, PortfolioUpdate,
    AssetResponse, AssetCreate,
    TransactionResponse, TransactionCreate,
    PerformanceSnapshotResponse, PerformanceSnapshotCreate,
    AssetAllocationResponse, AssetAllocationCreate,
    BenchmarkResponse, BenchmarkCreate,
    CapitalGainsReportResponse, CapitalGainsReportCreate,
    RebalancingRecommendationResponse, RebalancingRecommendationCreate,
    PortfolioDetailResponse
)
from tzutil import today_br

router = APIRouter(prefix="/api/analytics", tags=["analytics"])


# Portfolio Endpoints
@router.post("/portfolios", response_model=PortfolioResponse)
def create_portfolio(portfolio: PortfolioCreate, db: Session = Depends(get_db)):
    """Create a new portfolio"""
    # Check if clinic exists
    clinic = db.query(Clinic).filter(Clinic.id == portfolio.clinic_id).first()
    if not clinic:
        raise HTTPException(status_code=404, detail="Clinic not found")

    db_portfolio = Portfolio(**portfolio.dict())
    db.add(db_portfolio)
    db.commit()
    db.refresh(db_portfolio)
    return db_portfolio


@router.get("/portfolios", response_model=List[PortfolioResponse])
def list_portfolios(clinic_id: Optional[int] = None, skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    """List all portfolios, optionally filtered by clinic"""
    query = db.query(Portfolio)
    if clinic_id:
        query = query.filter(Portfolio.clinic_id == clinic_id)
    return query.offset(skip).limit(limit).all()


@router.get("/portfolios/{portfolio_id}", response_model=PortfolioDetailResponse)
def get_portfolio_detail(portfolio_id: int, db: Session = Depends(get_db)):
    """Get portfolio with details and relationships"""
    portfolio = db.query(Portfolio).filter(Portfolio.id == portfolio_id).first()
    if not portfolio:
        raise HTTPException(status_code=404, detail="Portfolio not found")

    # Get latest snapshot
    latest_snapshot = db.query(PortfolioPerformanceSnapshot).filter(
        PortfolioPerformanceSnapshot.portfolio_id == portfolio_id
    ).order_by(desc(PortfolioPerformanceSnapshot.snapshot_date)).first()

    result = PortfolioDetailResponse.from_orm(portfolio)
    result.latest_snapshot = latest_snapshot
    return result


@router.put("/portfolios/{portfolio_id}", response_model=PortfolioResponse)
def update_portfolio(portfolio_id: int, update_data: PortfolioUpdate, db: Session = Depends(get_db)):
    """Update portfolio"""
    portfolio = db.query(Portfolio).filter(Portfolio.id == portfolio_id).first()
    if not portfolio:
        raise HTTPException(status_code=404, detail="Portfolio not found")

    for field, value in update_data.dict(exclude_unset=True).items():
        setattr(portfolio, field, value)

    db.commit()
    db.refresh(portfolio)
    return portfolio


@router.delete("/portfolios/{portfolio_id}")
def delete_portfolio(portfolio_id: int, db: Session = Depends(get_db)):
    """Delete portfolio"""
    portfolio = db.query(Portfolio).filter(Portfolio.id == portfolio_id).first()
    if not portfolio:
        raise HTTPException(status_code=404, detail="Portfolio not found")

    db.delete(portfolio)
    db.commit()
    return {"message": "Portfolio deleted"}


# Asset Endpoints
@router.post("/portfolios/{portfolio_id}/assets", response_model=AssetResponse)
def create_asset(portfolio_id: int, asset: AssetCreate, db: Session = Depends(get_db)):
    """Add asset to portfolio"""
    # Verify portfolio exists
    portfolio = db.query(Portfolio).filter(Portfolio.id == portfolio_id).first()
    if not portfolio:
        raise HTTPException(status_code=404, detail="Portfolio not found")

    # Check for duplicate symbol
    existing = db.query(Asset).filter(
        and_(Asset.portfolio_id == portfolio_id, Asset.symbol == asset.symbol)
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Asset with this symbol already exists")

    db_asset = Asset(portfolio_id=portfolio_id, **asset.dict(exclude={"portfolio_id"}))
    db.add(db_asset)
    db.commit()
    db.refresh(db_asset)
    return db_asset


@router.get("/portfolios/{portfolio_id}/assets", response_model=List[AssetResponse])
def list_assets(portfolio_id: int, skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    """List assets in portfolio"""
    portfolio = db.query(Portfolio).filter(Portfolio.id == portfolio_id).first()
    if not portfolio:
        raise HTTPException(status_code=404, detail="Portfolio not found")

    return db.query(Asset).filter(
        Asset.portfolio_id == portfolio_id
    ).offset(skip).limit(limit).all()


@router.get("/assets/{asset_id}", response_model=AssetResponse)
def get_asset(asset_id: int, db: Session = Depends(get_db)):
    """Get asset details"""
    asset = db.query(Asset).filter(Asset.id == asset_id).first()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    return asset


# Transaction Endpoints
@router.post("/assets/{asset_id}/transactions", response_model=TransactionResponse)
def create_transaction(asset_id: int, transaction: TransactionCreate, db: Session = Depends(get_db)):
    """Record a transaction"""
    asset = db.query(Asset).filter(Asset.id == asset_id).first()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")

    db_transaction = Transaction(asset_id=asset_id, **transaction.dict(exclude={"asset_id"}))
    db.add(db_transaction)
    db.commit()
    db.refresh(db_transaction)
    return db_transaction


@router.get("/assets/{asset_id}/transactions", response_model=List[TransactionResponse])
def list_asset_transactions(asset_id: int, skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    """Get transaction history for an asset"""
    asset = db.query(Asset).filter(Asset.id == asset_id).first()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")

    return db.query(Transaction).filter(
        Transaction.asset_id == asset_id
    ).order_by(desc(Transaction.transaction_date)).offset(skip).limit(limit).all()


# Portfolio Performance Endpoints
@router.get("/portfolios/{portfolio_id}/performance")
def get_portfolio_performance(
    portfolio_id: int,
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    db: Session = Depends(get_db)
):
    """Get portfolio performance metrics"""
    portfolio = db.query(Portfolio).filter(Portfolio.id == portfolio_id).first()
    if not portfolio:
        raise HTTPException(status_code=404, detail="Portfolio not found")

    query = db.query(PortfolioPerformanceSnapshot).filter(
        PortfolioPerformanceSnapshot.portfolio_id == portfolio_id
    )

    if start_date:
        query = query.filter(PortfolioPerformanceSnapshot.snapshot_date >= start_date)
    if end_date:
        query = query.filter(PortfolioPerformanceSnapshot.snapshot_date <= end_date)

    snapshots = query.order_by(PortfolioPerformanceSnapshot.snapshot_date).all()

    return {
        "portfolio_id": portfolio_id,
        "snapshots": [PerformanceSnapshotResponse.from_orm(s) for s in snapshots],
        "latest": PerformanceSnapshotResponse.from_orm(snapshots[-1]) if snapshots else None
    }


@router.get("/portfolios/{portfolio_id}/breakdown")
def get_portfolio_breakdown(portfolio_id: int, snapshot_date: Optional[date] = None, db: Session = Depends(get_db)):
    """Get portfolio asset allocation breakdown"""
    portfolio = db.query(Portfolio).filter(Portfolio.id == portfolio_id).first()
    if not portfolio:
        raise HTTPException(status_code=404, detail="Portfolio not found")

    if not snapshot_date:
        snapshot_date = today_br()

    allocations = db.query(AssetAllocation).filter(
        and_(
            AssetAllocation.portfolio_id == portfolio_id,
            AssetAllocation.snapshot_date == snapshot_date
        )
    ).all()

    return {
        "portfolio_id": portfolio_id,
        "snapshot_date": snapshot_date,
        "allocations": [AssetAllocationResponse.from_orm(a) for a in allocations],
        "total_weight": sum(float(a.weight_percentage or 0) for a in allocations)
    }


@router.get("/portfolios/{portfolio_id}/returns")
def get_portfolio_returns(
    portfolio_id: int,
    period_days: int = Query(30),
    db: Session = Depends(get_db)
):
    """Calculate portfolio returns for a period"""
    portfolio = db.query(Portfolio).filter(Portfolio.id == portfolio_id).first()
    if not portfolio:
        raise HTTPException(status_code=404, detail="Portfolio not found")

    end_date = today_br()
    start_date = end_date - timedelta(days=period_days)

    snapshots = db.query(PortfolioPerformanceSnapshot).filter(
        and_(
            PortfolioPerformanceSnapshot.portfolio_id == portfolio_id,
            PortfolioPerformanceSnapshot.snapshot_date >= start_date,
            PortfolioPerformanceSnapshot.snapshot_date <= end_date
        )
    ).order_by(PortfolioPerformanceSnapshot.snapshot_date).all()

    if len(snapshots) < 2:
        return {
            "portfolio_id": portfolio_id,
            "period_days": period_days,
            "return_percentage": 0,
            "message": "Insufficient data for return calculation"
        }

    start_value = float(snapshots[0].total_value or 0)
    end_value = float(snapshots[-1].total_value or 0)

    if start_value == 0:
        return {
            "portfolio_id": portfolio_id,
            "period_days": period_days,
            "return_percentage": 0,
            "message": "No initial value"
        }

    return_pct = ((end_value - start_value) / start_value) * 100

    return {
        "portfolio_id": portfolio_id,
        "period_days": period_days,
        "start_date": start_date,
        "end_date": end_date,
        "start_value": start_value,
        "end_value": end_value,
        "return_percentage": round(return_pct, 2),
        "absolute_return": round(end_value - start_value, 2)
    }


@router.get("/portfolios/{portfolio_id}/comparison")
def get_portfolio_benchmark_comparison(
    portfolio_id: int,
    benchmark_id: Optional[int] = None,
    db: Session = Depends(get_db)
):
    """Compare portfolio performance against benchmarks"""
    portfolio = db.query(Portfolio).filter(Portfolio.id == portfolio_id).first()
    if not portfolio:
        raise HTTPException(status_code=404, detail="Portfolio not found")

    benchmarks_query = db.query(Benchmark).filter(Benchmark.portfolio_id == portfolio_id)
    if benchmark_id:
        benchmarks_query = benchmarks_query.filter(Benchmark.id == benchmark_id)

    benchmarks = benchmarks_query.all()

    comparison_data = []
    for benchmark in benchmarks:
        perf_records = db.query(BenchmarkPerformance).filter(
            BenchmarkPerformance.benchmark_id == benchmark.id
        ).order_by(BenchmarkPerformance.performance_date).all()

        if perf_records:
            comparison_data.append({
                "benchmark_id": benchmark.id,
                "benchmark_name": benchmark.benchmark_name,
                "benchmark_symbol": benchmark.benchmark_symbol,
                "latest_price": float(perf_records[-1].price) if perf_records else None,
                "latest_return": float(perf_records[-1].returns_percentage or 0) if perf_records else None,
                "records_count": len(perf_records)
            })

    return {
        "portfolio_id": portfolio_id,
        "benchmarks": comparison_data
    }


# Export Endpoints
@router.post("/portfolios/{portfolio_id}/export/csv")
def export_portfolio_csv(portfolio_id: int, db: Session = Depends(get_db)):
    """Export portfolio data as CSV"""
    portfolio = db.query(Portfolio).filter(Portfolio.id == portfolio_id).first()
    if not portfolio:
        raise HTTPException(status_code=404, detail="Portfolio not found")

    assets = db.query(Asset).filter(Asset.portfolio_id == portfolio_id).all()

    csv_content = "Symbol,Name,Asset Class,Current Price,Currency\n"
    for asset in assets:
        csv_content += f"{asset.symbol},{asset.name},{asset.asset_class},{asset.current_price},{asset.currency}\n"

    return {
        "portfolio_id": portfolio_id,
        "filename": f"portfolio_{portfolio_id}_{datetime.now().isoformat()}.csv",
        "content": csv_content
    }


@router.post("/portfolios/{portfolio_id}/export/json")
def export_portfolio_json(portfolio_id: int, db: Session = Depends(get_db)):
    """Export portfolio data as JSON"""
    portfolio = db.query(Portfolio).filter(Portfolio.id == portfolio_id).first()
    if not portfolio:
        raise HTTPException(status_code=404, detail="Portfolio not found")

    assets = db.query(Asset).filter(Asset.portfolio_id == portfolio_id).all()
    snapshots = db.query(PortfolioPerformanceSnapshot).filter(
        PortfolioPerformanceSnapshot.portfolio_id == portfolio_id
    ).order_by(desc(PortfolioPerformanceSnapshot.snapshot_date)).limit(30).all()

    return {
        "portfolio_id": portfolio_id,
        "portfolio_name": portfolio.portfolio_name,
        "currency": portfolio.currency,
        "initial_investment": str(portfolio.initial_investment),
        "assets": [
            {
                "id": a.id,
                "symbol": a.symbol,
                "name": a.name,
                "asset_class": a.asset_class,
                "current_price": str(a.current_price) if a.current_price else None
            } for a in assets
        ],
        "performance_snapshots": [
            {
                "snapshot_date": str(s.snapshot_date),
                "total_value": str(s.total_value),
                "roi_percentage": str(s.roi_percentage) if s.roi_percentage else None
            } for s in snapshots
        ]
    }


# Metrics Summary
@router.get("/portfolios/{portfolio_id}/metrics/summary")
def get_portfolio_metrics_summary(portfolio_id: int, db: Session = Depends(get_db)):
    """Get portfolio metrics summary"""
    portfolio = db.query(Portfolio).filter(Portfolio.id == portfolio_id).first()
    if not portfolio:
        raise HTTPException(status_code=404, detail="Portfolio not found")

    latest_snapshot = db.query(PortfolioPerformanceSnapshot).filter(
        PortfolioPerformanceSnapshot.portfolio_id == portfolio_id
    ).order_by(desc(PortfolioPerformanceSnapshot.snapshot_date)).first()

    assets = db.query(Asset).filter(Asset.portfolio_id == portfolio_id).all()

    return {
        "portfolio_id": portfolio_id,
        "portfolio_name": portfolio.portfolio_name,
        "total_value": str(latest_snapshot.total_value) if latest_snapshot else "0",
        "invested_value": str(latest_snapshot.invested_value) if latest_snapshot else "0",
        "roi_percentage": str(latest_snapshot.roi_percentage) if latest_snapshot else "0",
        "total_assets": len(assets),
        "currency": portfolio.currency,
        "last_updated": latest_snapshot.snapshot_date if latest_snapshot else None
    }
