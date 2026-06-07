"""Capital Gains Report model"""
from sqlalchemy import Column, Integer, String, Numeric, DateTime, ForeignKey, UniqueConstraint, Index
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from datetime import datetime
from database import Base


class CapitalGainsReport(Base):
    """CapitalGainsReport model - tax compliance reports"""
    __tablename__ = "capital_gains_reports"

    id = Column(Integer, primary_key=True, index=True)
    portfolio_id = Column(Integer, ForeignKey("portfolios.id"), nullable=False)
    tax_year = Column(Integer, nullable=False)
    tax_period = Column(String(20), nullable=False)  # monthly, quarterly, yearly
    short_term_gains = Column(Numeric(15, 2), default=0)  # < 180 days
    long_term_gains = Column(Numeric(15, 2), default=0)  # >= 180 days
    total_realized_gains = Column(Numeric(15, 2), default=0)
    total_fees = Column(Numeric(15, 2), default=0)
    total_taxes_paid = Column(Numeric(15, 2), default=0)
    total_transactions_count = Column(Integer, default=0)
    total_sales_amount = Column(Numeric(15, 2), default=0)
    report_generated_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    portfolio = relationship("Portfolio", back_populates="capital_gains_reports")

    __table_args__ = (
        UniqueConstraint('portfolio_id', 'tax_year', 'tax_period', name='uq_portfolio_year_period'),
        Index('idx_capital_gains_portfolio', 'portfolio_id'),
        Index('idx_capital_gains_year', 'tax_year'),
    )

    def get_total_gains(self) -> float:
        """Get total gains (short-term + long-term)"""
        return float(self.short_term_gains or 0) + float(self.long_term_gains or 0)

    def get_net_gains(self) -> float:
        """Get net gains after fees and taxes"""
        total_gains = self.get_total_gains()
        total_deductions = float(self.total_fees or 0) + float(self.total_taxes_paid or 0)
        return total_gains - total_deductions

    def get_effective_tax_rate(self) -> float:
        """Calculate effective tax rate"""
        total_gains = self.get_total_gains()
        if total_gains == 0:
            return 0
        return (float(self.total_taxes_paid or 0) / total_gains) * 100
