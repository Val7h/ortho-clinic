"""Portfolio Performance Snapshot model"""
from sqlalchemy import Column, Integer, Numeric, Date, DateTime, ForeignKey, UniqueConstraint, Index
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from datetime import datetime, date
from database import Base


class PortfolioPerformanceSnapshot(Base):
    """PortfolioPerformanceSnapshot model - daily portfolio state snapshot"""
    __tablename__ = "portfolio_performance_snapshots"

    id = Column(Integer, primary_key=True, index=True)
    portfolio_id = Column(Integer, ForeignKey("portfolios.id"), nullable=False)
    snapshot_date = Column(Date, nullable=False)
    total_value = Column(Numeric(15, 2), nullable=False)
    invested_value = Column(Numeric(15, 2), nullable=False)  # sum of cost basis
    total_gains = Column(Numeric(15, 2))
    unrealized_gains = Column(Numeric(15, 2))
    realized_gains = Column(Numeric(15, 2))
    roi_percentage = Column(Numeric(10, 4))
    cash_balance = Column(Numeric(15, 2), default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    portfolio = relationship("Portfolio", back_populates="performance_snapshots")

    __table_args__ = (
        UniqueConstraint('portfolio_id', 'snapshot_date', name='uq_portfolio_snapshot_date'),
        Index('idx_snapshots_portfolio', 'portfolio_id'),
        Index('idx_snapshots_date', 'snapshot_date'),
    )

    def calculate_roi(self) -> float:
        """Calculate ROI percentage"""
        if float(self.invested_value or 0) == 0:
            return 0
        gains = float(self.total_gains or 0)
        invested = float(self.invested_value or 0)
        return (gains / invested) * 100

    def get_total_return(self) -> float:
        """Get total return amount"""
        return float(self.total_value or 0) - float(self.invested_value or 0)
