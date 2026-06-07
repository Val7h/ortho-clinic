"""Unit tests for analytics models"""
import pytest
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy.orm import Session
from models import (
    Portfolio, Asset, Transaction, PortfolioPerformanceSnapshot,
    AssetAllocation, Benchmark, BenchmarkPerformance, TaxLot,
    CapitalGainsReport, PortfolioRebalancingRecommendation
)


@pytest.fixture
def portfolio(db_session):
    """Create a test portfolio"""
    portfolio = Portfolio(
        clinic_id=1,
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
        symbol="TEST",
        name="Test Asset",
        asset_class="stock",
        sector="technology",
        currency="BRL",
        current_price=Decimal("100.00")
    )
    db_session.add(asset)
    db_session.commit()
    return asset


# Portfolio Tests
def test_portfolio_creation(portfolio):
    """Test portfolio creation"""
    assert portfolio.id is not None
    assert portfolio.portfolio_name == "Test Portfolio"
    assert portfolio.currency == "BRL"
    assert portfolio.active is True


def test_portfolio_calculate_total_value(db_session, portfolio, asset):
    """Test portfolio total value calculation"""
    asset.current_price = Decimal("150.00")
    db_session.commit()

    total = portfolio.calculate_total_value()
    assert total == 150.0


def test_portfolio_get_performance_metric(db_session, portfolio):
    """Test portfolio performance metric retrieval"""
    snapshot = PortfolioPerformanceSnapshot(
        portfolio_id=portfolio.id,
        snapshot_date=date.today(),
        total_value=Decimal("100000.00"),
        invested_value=Decimal("95000.00"),
        roi_percentage=Decimal("5.26")
    )
    db_session.add(snapshot)
    db_session.commit()

    perf = portfolio.get_performance_metric()
    assert perf is not None
    assert perf.roi_percentage == Decimal("5.26")


# Asset Tests
def test_asset_creation(asset):
    """Test asset creation"""
    assert asset.id is not None
    assert asset.symbol == "TEST"
    assert asset.asset_class == "stock"


def test_asset_get_total_quantity(db_session, asset):
    """Test asset total quantity calculation"""
    tax_lot = TaxLot(
        asset_id=asset.id,
        purchase_date=date.today(),
        quantity=Decimal("100.00"),
        cost_per_unit=Decimal("50.00"),
        total_cost=Decimal("5000.00"),
        remaining_quantity=Decimal("100.00")
    )
    db_session.add(tax_lot)
    db_session.commit()

    quantity = asset.get_total_quantity()
    assert quantity == 100.0


def test_asset_get_market_value(db_session, asset):
    """Test asset market value calculation"""
    asset.current_price = Decimal("200.00")
    tax_lot = TaxLot(
        asset_id=asset.id,
        purchase_date=date.today(),
        quantity=Decimal("50.00"),
        cost_per_unit=Decimal("100.00"),
        total_cost=Decimal("5000.00"),
        remaining_quantity=Decimal("50.00")
    )
    db_session.add(tax_lot)
    db_session.commit()

    market_value = asset.get_market_value()
    assert market_value == 10000.0  # 50 * 200


def test_asset_get_cost_basis(db_session, asset):
    """Test asset cost basis calculation"""
    tax_lot = TaxLot(
        asset_id=asset.id,
        purchase_date=date.today(),
        quantity=Decimal("100.00"),
        cost_per_unit=Decimal("50.00"),
        total_cost=Decimal("5000.00"),
        remaining_quantity=Decimal("100.00")
    )
    db_session.add(tax_lot)
    db_session.commit()

    cost_basis = asset.get_cost_basis()
    assert cost_basis == 5000.0


def test_asset_get_gain_loss(db_session, asset):
    """Test asset unrealized gain/loss"""
    asset.current_price = Decimal("150.00")
    tax_lot = TaxLot(
        asset_id=asset.id,
        purchase_date=date.today(),
        quantity=Decimal("100.00"),
        cost_per_unit=Decimal("100.00"),
        total_cost=Decimal("10000.00"),
        remaining_quantity=Decimal("100.00")
    )
    db_session.add(tax_lot)
    db_session.commit()

    gain_loss = asset.get_gain_loss()
    assert gain_loss == 5000.0  # (100 * 150) - 10000


# Transaction Tests
def test_transaction_creation(db_session, asset):
    """Test transaction creation"""
    transaction = Transaction(
        asset_id=asset.id,
        transaction_type="buy",
        quantity=Decimal("100.00"),
        price=Decimal("50.00"),
        total_value=Decimal("5000.00"),
        fee=Decimal("25.00"),
        tax=Decimal("75.00"),
        net_value=Decimal("5100.00"),
        transaction_date=date.today()
    )
    db_session.add(transaction)
    db_session.commit()

    assert transaction.id is not None
    assert transaction.transaction_type == "buy"


def test_transaction_is_settled(db_session, asset):
    """Test transaction settlement status"""
    from datetime import timedelta
    transaction = Transaction(
        asset_id=asset.id,
        transaction_type="buy",
        quantity=Decimal("100.00"),
        price=Decimal("50.00"),
        total_value=Decimal("5000.00"),
        fee=Decimal("0"),
        tax=Decimal("0"),
        net_value=Decimal("5000.00"),
        transaction_date=date.today(),
        settlement_date=date.today() - timedelta(days=1)
    )
    db_session.add(transaction)
    db_session.commit()

    assert transaction.is_settled() is True


def test_transaction_get_effective_cost(db_session, asset):
    """Test transaction effective cost with fees and taxes"""
    transaction = Transaction(
        asset_id=asset.id,
        transaction_type="buy",
        quantity=Decimal("100.00"),
        price=Decimal("50.00"),
        total_value=Decimal("5000.00"),
        fee=Decimal("25.00"),
        tax=Decimal("75.00"),
        net_value=Decimal("5100.00"),
        transaction_date=date.today()
    )
    db_session.add(transaction)
    db_session.commit()

    effective_cost = transaction.get_effective_cost()
    assert effective_cost == 5100.0  # 5000 + 25 + 75


# Performance Snapshot Tests
def test_performance_snapshot_creation(db_session, portfolio):
    """Test performance snapshot creation"""
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

    assert snapshot.id is not None
    assert snapshot.roi_percentage == Decimal("5.00")


def test_performance_snapshot_calculate_roi(db_session, portfolio):
    """Test ROI calculation"""
    snapshot = PortfolioPerformanceSnapshot(
        portfolio_id=portfolio.id,
        snapshot_date=date.today(),
        total_value=Decimal("110000.00"),
        invested_value=Decimal("100000.00"),
        total_gains=Decimal("10000.00")
    )
    db_session.add(snapshot)
    db_session.commit()

    roi = snapshot.calculate_roi()
    assert roi == 10.0


# Tax Lot Tests
def test_tax_lot_creation(db_session, asset):
    """Test tax lot creation"""
    tax_lot = TaxLot(
        asset_id=asset.id,
        purchase_date=date.today(),
        quantity=Decimal("100.00"),
        cost_per_unit=Decimal("50.00"),
        total_cost=Decimal("5000.00"),
        remaining_quantity=Decimal("100.00")
    )
    db_session.add(tax_lot)
    db_session.commit()

    assert tax_lot.id is not None
    assert tax_lot.acquisition_status == "open"


def test_tax_lot_is_long_term(db_session, asset):
    """Test long-term holding period check"""
    from datetime import timedelta
    old_date = date.today() - timedelta(days=200)
    tax_lot = TaxLot(
        asset_id=asset.id,
        purchase_date=old_date,
        quantity=Decimal("100.00"),
        cost_per_unit=Decimal("50.00"),
        total_cost=Decimal("5000.00"),
        remaining_quantity=Decimal("100.00")
    )
    db_session.add(tax_lot)
    db_session.commit()

    assert tax_lot.is_long_term() is True


# Capital Gains Tests
def test_capital_gains_report_creation(db_session, portfolio):
    """Test capital gains report creation"""
    report = CapitalGainsReport(
        portfolio_id=portfolio.id,
        tax_year=2026,
        tax_period="monthly",
        short_term_gains=Decimal("1000.00"),
        long_term_gains=Decimal("5000.00"),
        total_realized_gains=Decimal("6000.00"),
        total_fees=Decimal("500.00"),
        total_taxes_paid=Decimal("1500.00")
    )
    db_session.add(report)
    db_session.commit()

    assert report.id is not None
    assert report.tax_year == 2026


def test_capital_gains_get_total_gains(db_session, portfolio):
    """Test total gains calculation"""
    report = CapitalGainsReport(
        portfolio_id=portfolio.id,
        tax_year=2026,
        tax_period="monthly",
        short_term_gains=Decimal("1000.00"),
        long_term_gains=Decimal("5000.00")
    )
    db_session.add(report)
    db_session.commit()

    total = report.get_total_gains()
    assert total == 6000.0


# Rebalancing Tests
def test_rebalancing_recommendation_creation(db_session, portfolio):
    """Test rebalancing recommendation creation"""
    rec = PortfolioRebalancingRecommendation(
        portfolio_id=portfolio.id,
        asset_class="stock",
        current_weight=Decimal("45.00"),
        target_weight=Decimal("50.00"),
        variance=Decimal("-5.00"),
        action="buy"
    )
    db_session.add(rec)
    db_session.commit()

    assert rec.id is not None
    assert rec.action == "buy"


def test_rebalancing_needs_rebalancing(db_session, portfolio):
    """Test rebalancing necessity check"""
    rec = PortfolioRebalancingRecommendation(
        portfolio_id=portfolio.id,
        asset_class="stock",
        current_weight=Decimal("52.00"),
        target_weight=Decimal("50.00"),
        variance=Decimal("2.00"),
        action="sell"
    )
    db_session.add(rec)
    db_session.commit()

    assert rec.needs_rebalancing(tolerance=2.0) is False
    assert rec.needs_rebalancing(tolerance=1.0) is True


# Asset Allocation Tests
def test_asset_allocation_creation(db_session, portfolio, asset):
    """Test asset allocation creation"""
    allocation = AssetAllocation(
        portfolio_id=portfolio.id,
        snapshot_date=date.today(),
        asset_id=asset.id,
        quantity=Decimal("100.00"),
        current_price=Decimal("100.00"),
        market_value=Decimal("10000.00"),
        weight_percentage=Decimal("25.00")
    )
    db_session.add(allocation)
    db_session.commit()

    assert allocation.id is not None
    assert allocation.weight_percentage == Decimal("25.00")


def test_asset_allocation_is_major_holding(db_session, portfolio, asset):
    """Test major holding check"""
    allocation = AssetAllocation(
        portfolio_id=portfolio.id,
        snapshot_date=date.today(),
        asset_id=asset.id,
        quantity=Decimal("100.00"),
        current_price=Decimal("100.00"),
        market_value=Decimal("10000.00"),
        weight_percentage=Decimal("25.00")
    )
    db_session.add(allocation)
    db_session.commit()

    assert allocation.is_major_holding(threshold=10.0) is True
    assert allocation.is_major_holding(threshold=30.0) is False
