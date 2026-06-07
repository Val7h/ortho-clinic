"""Asset model for analytics dashboard"""
from sqlalchemy import Column, Integer, String, Numeric, DateTime, ForeignKey, UniqueConstraint, Index
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from datetime import datetime
from database import Base


class Asset(Base):
    """Asset model - represents a security (stock, bond, ETF, crypto) in a portfolio"""
    __tablename__ = "assets"

    id = Column(Integer, primary_key=True, index=True)
    portfolio_id = Column(Integer, ForeignKey("portfolios.id"), nullable=False)
    symbol = Column(String(20), nullable=False)
    name = Column(String(255), nullable=False)
    asset_class = Column(String(50), nullable=False)  # stock, bond, etf, crypto
    sector = Column(String(100))
    currency = Column(String(3), default="BRL")
    current_price = Column(Numeric(15, 4))
    last_price_update = Column(DateTime(timezone=True))

    # Relationships
    portfolio = relationship("Portfolio", back_populates="assets")
    transactions = relationship("Transaction", back_populates="asset", cascade="all, delete-orphan")
    tax_lots = relationship("TaxLot", back_populates="asset", cascade="all, delete-orphan")
    asset_allocations = relationship("AssetAllocation", back_populates="asset", cascade="all, delete-orphan")

    __table_args__ = (
        UniqueConstraint('portfolio_id', 'symbol', name='uq_portfolio_symbol'),
        Index('idx_assets_portfolio', 'portfolio_id'),
        Index('idx_assets_symbol', 'symbol'),
    )

    def get_total_quantity(self) -> float:
        """Calculate total quantity held"""
        total = 0
        for tax_lot in self.tax_lots:
            if tax_lot.acquisition_status == "open":
                total += float(tax_lot.remaining_quantity or 0)
        return total

    def get_cost_basis(self) -> float:
        """Calculate total cost basis"""
        total = 0
        for tax_lot in self.tax_lots:
            if tax_lot.acquisition_status == "open":
                total += float(tax_lot.total_cost or 0)
        return total

    def get_market_value(self) -> float:
        """Calculate current market value"""
        quantity = self.get_total_quantity()
        price = float(self.current_price or 0)
        return quantity * price

    def get_gain_loss(self) -> float:
        """Calculate unrealized gain/loss"""
        return self.get_market_value() - self.get_cost_basis()
