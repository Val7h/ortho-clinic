"""Unit tests for analytics Pydantic schemas"""
import pytest
from pydantic import ValidationError
from datetime import date
from decimal import Decimal

from schemas.analytics import (
    PortfolioCreate, PortfolioResponse, AssetCreate, TransactionCreate,
    PerformanceSnapshotCreate, CapitalGainsReportCreate,
    RebalancingRecommendationCreate, AssetAllocationCreate, TaxLotCreate
)


# Portfolio Schema Tests
def test_portfolio_create_valid():
    """Test valid portfolio creation schema"""
    data = {
        "clinic_id": 1,
        "portfolio_name": "Test Portfolio",
        "currency": "BRL",
        "initial_investment": Decimal("100000.00")
    }
    portfolio = PortfolioCreate(**data)
    assert portfolio.portfolio_name == "Test Portfolio"
    assert portfolio.currency == "BRL"


def test_portfolio_create_invalid_name():
    """Test portfolio creation with empty name"""
    data = {
        "clinic_id": 1,
        "portfolio_name": "",
        "currency": "BRL",
        "initial_investment": Decimal("100000.00")
    }
    with pytest.raises(ValidationError):
        PortfolioCreate(**data)


def test_portfolio_create_negative_investment():
    """Test portfolio creation with negative investment"""
    data = {
        "clinic_id": 1,
        "portfolio_name": "Test Portfolio",
        "currency": "BRL",
        "initial_investment": Decimal("-1000.00")
    }
    with pytest.raises(ValidationError):
        PortfolioCreate(**data)


def test_portfolio_create_default_currency():
    """Test portfolio creation with default currency"""
    data = {
        "clinic_id": 1,
        "portfolio_name": "Test Portfolio",
        "initial_investment": Decimal("100000.00")
    }
    portfolio = PortfolioCreate(**data)
    assert portfolio.currency == "BRL"


# Asset Schema Tests
def test_asset_create_valid():
    """Test valid asset creation schema"""
    data = {
        "symbol": "PETR4",
        "name": "Petrobras",
        "asset_class": "stock",
        "sector": "energy",
        "currency": "BRL",
        "current_price": Decimal("25.50")
    }
    asset = AssetCreate(**data)
    assert asset.symbol == "PETR4"
    assert asset.asset_class == "stock"


def test_asset_create_long_symbol():
    """Test asset creation with symbol too long"""
    data = {
        "symbol": "A" * 21,
        "name": "Test Asset",
        "asset_class": "stock",
        "currency": "BRL"
    }
    with pytest.raises(ValidationError):
        AssetCreate(**data)


def test_asset_create_optional_fields():
    """Test asset creation with optional fields"""
    data = {
        "symbol": "TEST",
        "name": "Test Asset",
        "asset_class": "etf",
        "currency": "USD"
    }
    asset = AssetCreate(**data)
    assert asset.sector is None
    assert asset.current_price is None


# Transaction Schema Tests
def test_transaction_create_valid():
    """Test valid transaction creation schema"""
    data = {
        "asset_id": 1,
        "transaction_type": "buy",
        "quantity": Decimal("100.00"),
        "price": Decimal("25.00"),
        "total_value": Decimal("2500.00"),
        "fee": Decimal("10.00"),
        "tax": Decimal("0.00"),
        "net_value": Decimal("2510.00"),
        "transaction_date": date.today()
    }
    transaction = TransactionCreate(**data)
    assert transaction.transaction_type == "buy"
    assert transaction.quantity == Decimal("100.00")


def test_transaction_create_zero_quantity():
    """Test transaction creation with zero quantity"""
    data = {
        "asset_id": 1,
        "transaction_type": "buy",
        "quantity": Decimal("0.00"),
        "price": Decimal("25.00"),
        "total_value": Decimal("0.00"),
        "fee": Decimal("0.00"),
        "tax": Decimal("0.00"),
        "net_value": Decimal("0.00"),
        "transaction_date": date.today()
    }
    with pytest.raises(ValidationError):
        TransactionCreate(**data)


def test_transaction_create_negative_fee():
    """Test transaction creation with negative fee"""
    data = {
        "asset_id": 1,
        "transaction_type": "buy",
        "quantity": Decimal("100.00"),
        "price": Decimal("25.00"),
        "total_value": Decimal("2500.00"),
        "fee": Decimal("-10.00"),
        "tax": Decimal("0.00"),
        "net_value": Decimal("2490.00"),
        "transaction_date": date.today()
    }
    with pytest.raises(ValidationError):
        TransactionCreate(**data)


def test_transaction_create_default_fee_tax():
    """Test transaction creation with default fee and tax"""
    data = {
        "asset_id": 1,
        "transaction_type": "sell",
        "quantity": Decimal("50.00"),
        "price": Decimal("30.00"),
        "total_value": Decimal("1500.00"),
        "net_value": Decimal("1500.00"),
        "transaction_date": date.today()
    }
    transaction = TransactionCreate(**data)
    assert transaction.fee == Decimal("0")
    assert transaction.tax == Decimal("0")


# Performance Snapshot Schema Tests
def test_performance_snapshot_create_valid():
    """Test valid performance snapshot creation"""
    data = {
        "portfolio_id": 1,
        "snapshot_date": date.today(),
        "total_value": Decimal("105000.00"),
        "invested_value": Decimal("100000.00"),
        "total_gains": Decimal("5000.00"),
        "roi_percentage": Decimal("5.00"),
        "cash_balance": Decimal("10000.00")
    }
    snapshot = PerformanceSnapshotCreate(**data)
    assert snapshot.total_value == Decimal("105000.00")
    assert snapshot.roi_percentage == Decimal("5.00")


def test_performance_snapshot_create_negative_value():
    """Test performance snapshot creation with negative value"""
    data = {
        "portfolio_id": 1,
        "snapshot_date": date.today(),
        "total_value": Decimal("-105000.00"),
        "invested_value": Decimal("100000.00")
    }
    with pytest.raises(ValidationError):
        PerformanceSnapshotCreate(**data)


def test_performance_snapshot_create_optional_fields():
    """Test performance snapshot creation with optional fields"""
    data = {
        "portfolio_id": 1,
        "snapshot_date": date.today(),
        "total_value": Decimal("100000.00"),
        "invested_value": Decimal("100000.00")
    }
    snapshot = PerformanceSnapshotCreate(**data)
    assert snapshot.total_gains is None
    assert snapshot.roi_percentage is None


# Tax Lot Schema Tests
def test_tax_lot_create_valid():
    """Test valid tax lot creation"""
    data = {
        "asset_id": 1,
        "purchase_date": date.today(),
        "quantity": Decimal("100.00"),
        "cost_per_unit": Decimal("50.00"),
        "total_cost": Decimal("5000.00"),
        "remaining_quantity": Decimal("100.00"),
        "acquisition_status": "open",
        "cost_basis_method": "fifo"
    }
    tax_lot = TaxLotCreate(**data)
    assert tax_lot.quantity == Decimal("100.00")
    assert tax_lot.acquisition_status == "open"


def test_tax_lot_create_default_values():
    """Test tax lot creation with default values"""
    data = {
        "asset_id": 1,
        "purchase_date": date.today(),
        "quantity": Decimal("50.00"),
        "cost_per_unit": Decimal("100.00"),
        "total_cost": Decimal("5000.00"),
        "remaining_quantity": Decimal("50.00")
    }
    tax_lot = TaxLotCreate(**data)
    assert tax_lot.acquisition_status == "open"
    assert tax_lot.cost_basis_method == "fifo"
    assert tax_lot.quantity_sold == Decimal("0")


# Capital Gains Report Schema Tests
def test_capital_gains_create_valid():
    """Test valid capital gains report creation"""
    data = {
        "portfolio_id": 1,
        "tax_year": 2026,
        "tax_period": "monthly",
        "short_term_gains": Decimal("1000.00"),
        "long_term_gains": Decimal("5000.00"),
        "total_realized_gains": Decimal("6000.00"),
        "total_fees": Decimal("500.00"),
        "total_taxes_paid": Decimal("1500.00")
    }
    report = CapitalGainsReportCreate(**data)
    assert report.tax_year == 2026
    assert report.tax_period == "monthly"


def test_capital_gains_create_invalid_year():
    """Test capital gains with invalid year"""
    data = {
        "portfolio_id": 1,
        "tax_year": 1800,
        "tax_period": "monthly",
        "short_term_gains": Decimal("1000.00"),
        "long_term_gains": Decimal("5000.00"),
        "total_realized_gains": Decimal("6000.00")
    }
    with pytest.raises(ValidationError):
        CapitalGainsReportCreate(**data)


def test_capital_gains_create_default_values():
    """Test capital gains with default values"""
    data = {
        "portfolio_id": 1,
        "tax_year": 2026,
        "tax_period": "yearly"
    }
    report = CapitalGainsReportCreate(**data)
    assert report.short_term_gains == Decimal("0")
    assert report.long_term_gains == Decimal("0")
    assert report.total_fees == Decimal("0")


# Rebalancing Recommendation Schema Tests
def test_rebalancing_create_valid():
    """Test valid rebalancing recommendation creation"""
    data = {
        "portfolio_id": 1,
        "asset_class": "stock",
        "current_weight": Decimal("45.00"),
        "target_weight": Decimal("50.00"),
        "variance": Decimal("-5.00"),
        "action": "buy"
    }
    rec = RebalancingRecommendationCreate(**data)
    assert rec.asset_class == "stock"
    assert rec.action == "buy"


def test_rebalancing_create_weight_bounds():
    """Test rebalancing with invalid weight bounds"""
    data = {
        "portfolio_id": 1,
        "asset_class": "stock",
        "current_weight": Decimal("150.00"),
        "target_weight": Decimal("50.00"),
        "action": "sell"
    }
    with pytest.raises(ValidationError):
        RebalancingRecommendationCreate(**data)


# Asset Allocation Schema Tests
def test_asset_allocation_create_valid():
    """Test valid asset allocation creation"""
    data = {
        "portfolio_id": 1,
        "snapshot_date": date.today(),
        "asset_id": 1,
        "quantity": Decimal("100.00"),
        "current_price": Decimal("100.00"),
        "market_value": Decimal("10000.00"),
        "weight_percentage": Decimal("25.00")
    }
    allocation = AssetAllocationCreate(**data)
    assert allocation.quantity == Decimal("100.00")
    assert allocation.weight_percentage == Decimal("25.00")


def test_asset_allocation_zero_quantity():
    """Test asset allocation with zero quantity"""
    data = {
        "portfolio_id": 1,
        "snapshot_date": date.today(),
        "asset_id": 1,
        "quantity": Decimal("0.00"),
        "current_price": Decimal("100.00"),
        "market_value": Decimal("0.00")
    }
    with pytest.raises(ValidationError):
        AssetAllocationCreate(**data)


# Integration Tests
def test_portfolio_response_serialization():
    """Test portfolio response serialization"""
    from datetime import datetime
    data = {
        "id": 1,
        "clinic_id": 1,
        "portfolio_name": "Test Portfolio",
        "currency": "BRL",
        "initial_investment": Decimal("100000.00"),
        "created_at": datetime.now(),
        "updated_at": datetime.now(),
        "active": True
    }
    response = PortfolioResponse(**data)
    assert response.id == 1
    assert response.portfolio_name == "Test Portfolio"


def test_complex_schema_validation():
    """Test complex nested schema validation"""
    transaction_data = {
        "asset_id": 1,
        "transaction_type": "buy",
        "quantity": Decimal("100.50"),
        "price": Decimal("123.45"),
        "total_value": Decimal("12377.25"),
        "fee": Decimal("25.00"),
        "tax": Decimal("50.00"),
        "net_value": Decimal("12452.25"),
        "transaction_date": date.today(),
        "settlement_date": date.today(),
        "notes": "Test transaction"
    }
    transaction = TransactionCreate(**transaction_data)
    assert transaction.notes == "Test transaction"
    assert transaction.settlement_date == date.today()
