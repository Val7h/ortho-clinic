"""Pydantic schemas for Analytics Dashboard"""
from pydantic import BaseModel, Field
from datetime import datetime, date
from typing import List, Optional
from decimal import Decimal


# Portfolio Schemas
class PortfolioBase(BaseModel):
    """Base portfolio schema"""
    clinic_id: int
    portfolio_name: str = Field(..., min_length=1, max_length=255)
    currency: str = Field(default="BRL", max_length=3)
    initial_investment: Decimal = Field(..., gt=0)
    active: bool = True


class PortfolioCreate(PortfolioBase):
    """Schema for creating a new portfolio"""
    pass


class PortfolioUpdate(BaseModel):
    """Schema for updating portfolio"""
    portfolio_name: Optional[str] = None
    currency: Optional[str] = None
    active: Optional[bool] = None


class PortfolioResponse(PortfolioBase):
    """Schema for portfolio response"""
    id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# Asset Schemas
class AssetBase(BaseModel):
    """Base asset schema"""
    symbol: str = Field(..., max_length=20)
    name: str = Field(..., min_length=1, max_length=255)
    asset_class: str = Field(..., max_length=50)
    sector: Optional[str] = None
    currency: str = Field(default="BRL", max_length=3)
    current_price: Optional[Decimal] = None


class AssetCreate(AssetBase):
    """Schema for creating an asset"""
    portfolio_id: int


class AssetUpdate(BaseModel):
    """Schema for updating asset"""
    name: Optional[str] = None
    sector: Optional[str] = None
    current_price: Optional[Decimal] = None


class AssetResponse(AssetBase):
    """Schema for asset response"""
    id: int
    portfolio_id: int
    last_price_update: Optional[datetime]

    class Config:
        from_attributes = True


# Transaction Schemas
class TransactionBase(BaseModel):
    """Base transaction schema"""
    transaction_type: str = Field(..., max_length=10)  # buy, sell, dividend
    quantity: Decimal = Field(..., gt=0)
    price: Decimal = Field(..., gt=0)
    total_value: Decimal = Field(..., gt=0)
    fee: Decimal = Field(default=0, ge=0)
    tax: Decimal = Field(default=0, ge=0)
    net_value: Decimal = Field(..., gt=0)
    transaction_date: date
    settlement_date: Optional[date] = None
    notes: Optional[str] = None


class TransactionCreate(TransactionBase):
    """Schema for creating a transaction"""
    asset_id: int


class TransactionResponse(TransactionBase):
    """Schema for transaction response"""
    id: int
    asset_id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# Performance Snapshot Schemas
class PerformanceSnapshotBase(BaseModel):
    """Base performance snapshot schema"""
    snapshot_date: date
    total_value: Decimal = Field(..., ge=0)
    invested_value: Decimal = Field(..., ge=0)
    total_gains: Optional[Decimal] = None
    unrealized_gains: Optional[Decimal] = None
    realized_gains: Optional[Decimal] = None
    roi_percentage: Optional[Decimal] = None
    cash_balance: Decimal = Field(default=0, ge=0)


class PerformanceSnapshotCreate(PerformanceSnapshotBase):
    """Schema for creating a performance snapshot"""
    portfolio_id: int


class PerformanceSnapshotResponse(PerformanceSnapshotBase):
    """Schema for performance snapshot response"""
    id: int
    portfolio_id: int
    created_at: datetime

    class Config:
        from_attributes = True


# Asset Allocation Schemas
class AssetAllocationBase(BaseModel):
    """Base asset allocation schema"""
    snapshot_date: date
    quantity: Decimal = Field(..., gt=0)
    current_price: Decimal = Field(..., gt=0)
    market_value: Decimal = Field(..., ge=0)
    weight_percentage: Optional[Decimal] = None


class AssetAllocationCreate(AssetAllocationBase):
    """Schema for creating asset allocation"""
    portfolio_id: int
    asset_id: int


class AssetAllocationResponse(AssetAllocationBase):
    """Schema for asset allocation response"""
    id: int
    portfolio_id: int
    asset_id: int
    created_at: datetime

    class Config:
        from_attributes = True


# Benchmark Schemas
class BenchmarkBase(BaseModel):
    """Base benchmark schema"""
    benchmark_name: str = Field(..., min_length=1, max_length=100)
    benchmark_symbol: str = Field(..., max_length=20)
    benchmark_type: str = Field(..., max_length=50)


class BenchmarkCreate(BenchmarkBase):
    """Schema for creating a benchmark"""
    portfolio_id: int


class BenchmarkResponse(BenchmarkBase):
    """Schema for benchmark response"""
    id: int
    portfolio_id: int

    class Config:
        from_attributes = True


# Benchmark Performance Schemas
class BenchmarkPerformanceBase(BaseModel):
    """Base benchmark performance schema"""
    performance_date: date
    price: Decimal = Field(..., gt=0)
    returns_percentage: Optional[Decimal] = None


class BenchmarkPerformanceCreate(BenchmarkPerformanceBase):
    """Schema for creating benchmark performance"""
    benchmark_id: int


class BenchmarkPerformanceResponse(BenchmarkPerformanceBase):
    """Schema for benchmark performance response"""
    id: int
    benchmark_id: int
    created_at: datetime

    class Config:
        from_attributes = True


# Tax Lot Schemas
class TaxLotBase(BaseModel):
    """Base tax lot schema"""
    purchase_date: date
    quantity: Decimal = Field(..., gt=0)
    cost_per_unit: Decimal = Field(..., gt=0)
    total_cost: Decimal = Field(..., gt=0)
    quantity_sold: Decimal = Field(default=0, ge=0)
    remaining_quantity: Decimal
    acquisition_status: str = Field(default="open", max_length=20)
    cost_basis_method: str = Field(default="fifo", max_length=20)


class TaxLotCreate(TaxLotBase):
    """Schema for creating a tax lot"""
    asset_id: int


class TaxLotResponse(TaxLotBase):
    """Schema for tax lot response"""
    id: int
    asset_id: int
    created_at: datetime

    class Config:
        from_attributes = True


# Capital Gains Report Schemas
class CapitalGainsReportBase(BaseModel):
    """Base capital gains report schema"""
    tax_year: int = Field(..., gt=1900, le=2100)
    tax_period: str = Field(..., max_length=20)
    short_term_gains: Decimal = Field(default=0, ge=0)
    long_term_gains: Decimal = Field(default=0, ge=0)
    total_realized_gains: Decimal = Field(default=0, ge=0)
    total_fees: Decimal = Field(default=0, ge=0)
    total_taxes_paid: Decimal = Field(default=0, ge=0)
    total_transactions_count: int = Field(default=0, ge=0)
    total_sales_amount: Decimal = Field(default=0, ge=0)


class CapitalGainsReportCreate(CapitalGainsReportBase):
    """Schema for creating a capital gains report"""
    portfolio_id: int


class CapitalGainsReportResponse(CapitalGainsReportBase):
    """Schema for capital gains report response"""
    id: int
    portfolio_id: int
    report_generated_at: datetime

    class Config:
        from_attributes = True


# Rebalancing Recommendation Schemas
class RebalancingRecommendationBase(BaseModel):
    """Base rebalancing recommendation schema"""
    asset_class: str = Field(..., max_length=50)
    current_weight: Decimal = Field(..., ge=0, le=100)
    target_weight: Decimal = Field(..., ge=0, le=100)
    variance: Optional[Decimal] = None
    action: str = Field(..., max_length=20)
    recommended_amount: Optional[Decimal] = None


class RebalancingRecommendationCreate(RebalancingRecommendationBase):
    """Schema for creating a rebalancing recommendation"""
    portfolio_id: int


class RebalancingRecommendationResponse(RebalancingRecommendationBase):
    """Schema for rebalancing recommendation response"""
    id: int
    portfolio_id: int
    created_at: datetime

    class Config:
        from_attributes = True


# Complex Response Schemas
class PortfolioDetailResponse(PortfolioResponse):
    """Detailed portfolio response with nested data"""
    assets: List[AssetResponse] = []
    latest_snapshot: Optional[PerformanceSnapshotResponse] = None
    benchmarks: List[BenchmarkResponse] = []


class AssetDetailResponse(AssetResponse):
    """Detailed asset response with nested data"""
    transactions: List[TransactionResponse] = []
    tax_lots: List[TaxLotResponse] = []
