"""Transaction model for analytics dashboard"""
from sqlalchemy import Column, Integer, String, Numeric, Date, DateTime, ForeignKey, Text, Index
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from datetime import datetime, date
from database import Base


class Transaction(Base):
    """Transaction model - represents buy/sell/dividend transactions"""
    __tablename__ = "transactions"

    id = Column(Integer, primary_key=True, index=True)
    asset_id = Column(Integer, ForeignKey("assets.id"), nullable=False)
    transaction_type = Column(String(10), nullable=False)  # buy, sell, dividend
    quantity = Column(Numeric(15, 6), nullable=False)
    price = Column(Numeric(15, 4), nullable=False)
    total_value = Column(Numeric(15, 2), nullable=False)
    fee = Column(Numeric(15, 2), default=0)
    tax = Column(Numeric(15, 2), default=0)
    net_value = Column(Numeric(15, 2), nullable=False)
    transaction_date = Column(Date, nullable=False)
    settlement_date = Column(Date)
    notes = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    asset = relationship("Asset", back_populates="transactions")

    __table_args__ = (
        Index('idx_transactions_asset', 'asset_id'),
        Index('idx_transactions_date', 'transaction_date'),
        Index('idx_transactions_type', 'transaction_type'),
    )

    def is_settled(self) -> bool:
        """Check if transaction is settled"""
        if self.settlement_date is None:
            return False
        return self.settlement_date <= date.today()

    def get_effective_cost(self) -> float:
        """Get cost including fees and taxes"""
        return float(self.total_value) + float(self.fee or 0) + float(self.tax or 0)
