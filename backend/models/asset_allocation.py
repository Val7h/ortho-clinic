"""Asset Allocation model"""
from sqlalchemy import Column, Integer, Numeric, Date, DateTime, ForeignKey, UniqueConstraint, Index
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from datetime import datetime, date
from database import Base


class AssetAllocation(Base):
    """AssetAllocation model - asset distribution snapshot for a specific date"""
    __tablename__ = "asset_allocations"

    id = Column(Integer, primary_key=True, index=True)
    portfolio_id = Column(Integer, ForeignKey("portfolios.id"), nullable=False)
    snapshot_date = Column(Date, nullable=False)
    asset_id = Column(Integer, ForeignKey("assets.id"), nullable=False)
    quantity = Column(Numeric(15, 6), nullable=False)
    current_price = Column(Numeric(15, 4), nullable=False)
    market_value = Column(Numeric(15, 2), nullable=False)
    weight_percentage = Column(Numeric(6, 2))  # 0.00 to 100.00
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    portfolio = relationship("Portfolio", back_populates="asset_allocations")
    asset = relationship("Asset", back_populates="asset_allocations")

    __table_args__ = (
        UniqueConstraint('portfolio_id', 'snapshot_date', 'asset_id', name='uq_portfolio_snapshot_asset'),
        Index('idx_allocations_portfolio', 'portfolio_id'),
        Index('idx_allocations_snapshot_date', 'snapshot_date'),
    )

    def is_major_holding(self, threshold: float = 5.0) -> bool:
        """Check if this allocation exceeds threshold percentage"""
        return float(self.weight_percentage or 0) >= threshold

    def get_value_in_brl(self) -> float:
        """Get market value in BRL"""
        return float(self.market_value or 0)
