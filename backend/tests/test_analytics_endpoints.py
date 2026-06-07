"""Unit tests for analytics API endpoints"""
import pytest
from fastapi.testclient import TestClient
from datetime import date, datetime, timedelta
from decimal import Decimal
from sqlalchemy.orm import Session

from main import app
from models import Portfolio, Asset, Transaction, PortfolioPerformanceSnapshot, Clinic
from database import get_db


client = TestClient(app)


@pytest.fixture
def clinic(db_session):
    """Create a test clinic"""
    clinic = Clinic(
        name="Test Clinic",
        phone="11999999999"
    )
    db_session.add(clinic)
    db_session.commit()
    return clinic


@pytest.fixture
def portfolio(db_session, clinic):
    """Create a test portfolio"""
    portfolio = Portfolio(
        clinic_id=clinic.id,
        portfolio_name="Test Portfolio",
        currency="BRL",
        initial_investment=Decimal("100000.00")
    )
    db_session.add(portfolio)
    db_session.commit()
    return portfolio


@pytest.fixture
def asset(db_session, portfolio):
    """Create a test asset"""
    asset = Asset(
        portfolio_id=portfolio.id,
        symbol="PETR4",
        name="Petrobras",
        asset_class="stock",
        sector="energy",
        currency="BRL",
        current_price=Decimal("25.50")
    )
    db_session.add(asset)
    db_session.commit()
    return asset


@pytest.fixture
def performance_snapshot(db_session, portfolio):
    """Create a test performance snapshot"""
    snapshot = PortfolioPerformanceSnapshot(
        portfolio_id=portfolio.id,
        snapshot_date=date.today(),
        total_value=Decimal("105000.00"),
        invested_value=Decimal("100000.00"),
        total_gains=Decimal("5000.00"),
        roi_percentage=Decimal("5.00")
    )
    db_session.add(snapshot)
    db_session.commit()
    return snapshot


# Portfolio Endpoint Tests
def test_create_portfolio(db_session, clinic):
    """Test portfolio creation endpoint"""
    payload = {
        "clinic_id": clinic.id,
        "portfolio_name": "New Portfolio",
        "currency": "BRL",
        "initial_investment": "50000.00"
    }
    response = client.post("/api/analytics/portfolios", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["portfolio_name"] == "New Portfolio"
    assert data["currency"] == "BRL"


def test_create_portfolio_invalid_clinic(db_session):
    """Test portfolio creation with invalid clinic"""
    payload = {
        "clinic_id": 99999,
        "portfolio_name": "New Portfolio",
        "currency": "BRL",
        "initial_investment": "50000.00"
    }
    response = client.post("/api/analytics/portfolios", json=payload)
    assert response.status_code == 404


def test_list_portfolios(db_session, portfolio):
    """Test list portfolios endpoint"""
    response = client.get("/api/analytics/portfolios")
    assert response.status_code == 200
    data = response.json()
    assert len(data) > 0


def test_list_portfolios_by_clinic(db_session, portfolio, clinic):
    """Test list portfolios filtered by clinic"""
    response = client.get(f"/api/analytics/portfolios?clinic_id={clinic.id}")
    assert response.status_code == 200
    data = response.json()
    assert len(data) > 0
    assert data[0]["clinic_id"] == clinic.id


def test_get_portfolio_detail(db_session, portfolio):
    """Test get portfolio detail endpoint"""
    response = client.get(f"/api/analytics/portfolios/{portfolio.id}")
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == portfolio.id
    assert data["portfolio_name"] == portfolio.portfolio_name


def test_get_portfolio_not_found(db_session):
    """Test get portfolio with invalid ID"""
    response = client.get("/api/analytics/portfolios/99999")
    assert response.status_code == 404


def test_update_portfolio(db_session, portfolio):
    """Test update portfolio endpoint"""
    payload = {
        "portfolio_name": "Updated Portfolio",
        "active": False
    }
    response = client.put(f"/api/analytics/portfolios/{portfolio.id}", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["portfolio_name"] == "Updated Portfolio"
    assert data["active"] is False


def test_delete_portfolio(db_session, portfolio):
    """Test delete portfolio endpoint"""
    portfolio_id = portfolio.id
    response = client.delete(f"/api/analytics/portfolios/{portfolio_id}")
    assert response.status_code == 200

    # Verify deletion
    response = client.get(f"/api/analytics/portfolios/{portfolio_id}")
    assert response.status_code == 404


# Asset Endpoint Tests
def test_create_asset(db_session, portfolio):
    """Test create asset endpoint"""
    payload = {
        "symbol": "VALE3",
        "name": "Vale",
        "asset_class": "stock",
        "sector": "mining",
        "currency": "BRL",
        "current_price": "15.50"
    }
    response = client.post(f"/api/analytics/portfolios/{portfolio.id}/assets", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["symbol"] == "VALE3"
    assert data["portfolio_id"] == portfolio.id


def test_create_asset_duplicate_symbol(db_session, portfolio, asset):
    """Test create asset with duplicate symbol"""
    payload = {
        "symbol": asset.symbol,
        "name": "Another Asset",
        "asset_class": "stock",
        "sector": "energy",
        "currency": "BRL",
        "current_price": "20.00"
    }
    response = client.post(f"/api/analytics/portfolios/{portfolio.id}/assets", json=payload)
    assert response.status_code == 400


def test_list_assets(db_session, portfolio, asset):
    """Test list assets endpoint"""
    response = client.get(f"/api/analytics/portfolios/{portfolio.id}/assets")
    assert response.status_code == 200
    data = response.json()
    assert len(data) > 0
    assert data[0]["symbol"] == asset.symbol


def test_get_asset(db_session, asset):
    """Test get asset endpoint"""
    response = client.get(f"/api/analytics/assets/{asset.id}")
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == asset.id
    assert data["symbol"] == asset.symbol


def test_get_asset_not_found(db_session):
    """Test get asset with invalid ID"""
    response = client.get("/api/analytics/assets/99999")
    assert response.status_code == 404


# Transaction Endpoint Tests
def test_create_transaction(db_session, asset):
    """Test create transaction endpoint"""
    payload = {
        "transaction_type": "buy",
        "quantity": "100.00",
        "price": "25.00",
        "total_value": "2500.00",
        "fee": "10.00",
        "tax": "0.00",
        "net_value": "2510.00",
        "transaction_date": "2026-06-07"
    }
    response = client.post(f"/api/analytics/assets/{asset.id}/transactions", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["transaction_type"] == "buy"
    assert data["asset_id"] == asset.id


def test_list_asset_transactions(db_session, asset):
    """Test list asset transactions endpoint"""
    # Create a transaction first
    transaction = Transaction(
        asset_id=asset.id,
        transaction_type="buy",
        quantity=Decimal("100.00"),
        price=Decimal("25.00"),
        total_value=Decimal("2500.00"),
        fee=Decimal("10.00"),
        tax=Decimal("0.00"),
        net_value=Decimal("2510.00"),
        transaction_date=date.today()
    )
    db_session.add(transaction)
    db_session.commit()

    response = client.get(f"/api/analytics/assets/{asset.id}/transactions")
    assert response.status_code == 200
    data = response.json()
    assert len(data) > 0


# Portfolio Performance Endpoint Tests
def test_get_portfolio_performance(db_session, portfolio, performance_snapshot):
    """Test get portfolio performance endpoint"""
    response = client.get(f"/api/analytics/portfolios/{portfolio.id}/performance")
    assert response.status_code == 200
    data = response.json()
    assert data["portfolio_id"] == portfolio.id
    assert len(data["snapshots"]) > 0


def test_get_portfolio_performance_with_dates(db_session, portfolio, performance_snapshot):
    """Test get portfolio performance with date filters"""
    start_date = (date.today() - timedelta(days=30)).isoformat()
    end_date = date.today().isoformat()
    response = client.get(
        f"/api/analytics/portfolios/{portfolio.id}/performance",
        params={"start_date": start_date, "end_date": end_date}
    )
    assert response.status_code == 200
    data = response.json()
    assert data["portfolio_id"] == portfolio.id


def test_get_portfolio_breakdown(db_session, portfolio):
    """Test get portfolio asset breakdown endpoint"""
    response = client.get(f"/api/analytics/portfolios/{portfolio.id}/breakdown")
    assert response.status_code == 200
    data = response.json()
    assert data["portfolio_id"] == portfolio.id
    assert "allocations" in data


def test_get_portfolio_returns(db_session, portfolio, performance_snapshot):
    """Test get portfolio returns endpoint"""
    response = client.get(f"/api/analytics/portfolios/{portfolio.id}/returns")
    assert response.status_code == 200
    data = response.json()
    assert data["portfolio_id"] == portfolio.id
    assert "return_percentage" in data


def test_get_portfolio_comparison(db_session, portfolio):
    """Test get portfolio benchmark comparison endpoint"""
    response = client.get(f"/api/analytics/portfolios/{portfolio.id}/comparison")
    assert response.status_code == 200
    data = response.json()
    assert data["portfolio_id"] == portfolio.id
    assert "benchmarks" in data


# Export Endpoint Tests
def test_export_portfolio_csv(db_session, portfolio, asset):
    """Test export portfolio as CSV endpoint"""
    response = client.post(f"/api/analytics/portfolios/{portfolio.id}/export/csv")
    assert response.status_code == 200
    data = response.json()
    assert "filename" in data
    assert "content" in data
    assert "Symbol,Name,Asset Class" in data["content"]


def test_export_portfolio_json(db_session, portfolio, asset):
    """Test export portfolio as JSON endpoint"""
    response = client.post(f"/api/analytics/portfolios/{portfolio.id}/export/json")
    assert response.status_code == 200
    data = response.json()
    assert data["portfolio_id"] == portfolio.id
    assert "assets" in data
    assert len(data["assets"]) > 0


# Metrics Summary Tests
def test_get_portfolio_metrics_summary(db_session, portfolio, performance_snapshot):
    """Test get portfolio metrics summary endpoint"""
    response = client.get(f"/api/analytics/portfolios/{portfolio.id}/metrics/summary")
    assert response.status_code == 200
    data = response.json()
    assert data["portfolio_id"] == portfolio.id
    assert "total_value" in data
    assert "roi_percentage" in data
