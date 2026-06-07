"""Portfolio model for analytics dashboard"""
from sqlalchemy import Column, Integer, String, Numeric, DateTime, Boolean, ForeignKey, UniqueConstraint, Index
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from datetime import datetime
from database import Base


class Portfolio(Base):
    """Portfolio model - represents a single investment portfolio for a clinic"""
    __tablename__ = "portfolios"

    id = Column(Integer, primary_key=True, index=True)
    clinic_id = Column(Integer, ForeignKey("clinics.id"), nullable=False)
    portfolio_name = Column(String(255), nullable=False)
    currency = Column(String(3), default="BRL")
    initial_investment = Column(Numeric(15, 2), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    active = Column(Boolean, default=True)

    # Relationships
    assets = relationship("Asset", back_populates="portfolio", cascade="all, delete-orphan")
    performance_snapshots = relationship("PortfolioPerformanceSnapshot", back_populates="portfolio", cascade="all, delete-orphan")
    asset_allocations = relationship("AssetAllocation", back_populates="portfolio", cascade="all, delete-orphan")
    benchmarks = relationship("Benchmark", back_populates="portfolio", cascade="all, delete-orphan")
    capital_gains_reports = relationship("CapitalGainsReport", back_populates="portfolio", cascade="all, delete-orphan")
    rebalancing_recommendations = relationship("PortfolioRebalancingRecommendation", back_populates="portfolio", cascade="all, delete-orphan")

    __table_args__ = (
        UniqueConstraint('clinic_id', 'portfolio_name', name='uq_clinic_portfolio_name'),
        Index('idx_portfolios_clinic', 'clinic_id'),
    )

    def calculate_total_value(self) -> float:
        """Calculate total portfolio value from assets"""
        total = 0
        for asset in self.assets:
            total += float(asset.current_price or 0)
        return total

    def get_performance_metric(self, snapshot_date=None):
        """Get performance metrics for a specific date or latest"""
        if snapshot_date:
            return next((s for s in self.performance_snapshots if s.snapshot_date == snapshot_date), None)
        return self.performance_snapshots[-1] if self.performance_snapshots else None
