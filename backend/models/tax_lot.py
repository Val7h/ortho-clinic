"""Tax Lot model for cost basis tracking"""
from sqlalchemy import Column, Integer, String, Numeric, Date, DateTime, ForeignKey, Index
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from datetime import datetime, date
from database import Base


class TaxLot(Base):
    """TaxLot model - cost basis tracking per purchase batch"""
    __tablename__ = "tax_lots"

    id = Column(Integer, primary_key=True, index=True)
    asset_id = Column(Integer, ForeignKey("assets.id"), nullable=False)
    purchase_date = Column(Date, nullable=False)
    quantity = Column(Numeric(15, 6), nullable=False)
    cost_per_unit = Column(Numeric(15, 4), nullable=False)
    total_cost = Column(Numeric(15, 2), nullable=False)
    quantity_sold = Column(Numeric(15, 6), default=0)
    remaining_quantity = Column(Numeric(15, 6))
    acquisition_status = Column(String(20), default="open")  # open, closed
    cost_basis_method = Column(String(20), default="fifo")  # fifo, lifo, avg_cost
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    asset = relationship("Asset", back_populates="tax_lots")

    __table_args__ = (
        Index('idx_tax_lots_asset', 'asset_id'),
        Index('idx_tax_lots_status', 'acquisition_status'),
    )

    def is_long_term(self, reference_date: date = None) -> bool:
        """Check if holding period exceeds 180 days (long-term gain in Brazil)"""
        from datetime import timedelta
        ref_date = reference_date or date.today()
        holding_period = (ref_date - self.purchase_date).days
        return holding_period >= 180

    def get_remaining_value(self, current_price: float) -> float:
        """Get current value of remaining quantity"""
        return float(self.remaining_quantity or 0) * current_price

    def get_gain_loss(self, current_price: float) -> float:
        """Get unrealized gain/loss on remaining quantity"""
        remaining_market_value = self.get_remaining_value(current_price)
        remaining_cost = float(self.remaining_quantity or 0) * float(self.cost_per_unit or 0)
        return remaining_market_value - remaining_cost
