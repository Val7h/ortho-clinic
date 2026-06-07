"""Portfolio Rebalancing Recommendation model"""
from sqlalchemy import Column, Integer, String, Numeric, DateTime, ForeignKey, Index
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from datetime import datetime
from database import Base


class PortfolioRebalancingRecommendation(Base):
    """PortfolioRebalancingRecommendation model - asset allocation suggestions"""
    __tablename__ = "portfolio_rebalancing_recommendations"

    id = Column(Integer, primary_key=True, index=True)
    portfolio_id = Column(Integer, ForeignKey("portfolios.id"), nullable=False)
    asset_class = Column(String(50), nullable=False)  # stock, bond, etf, crypto
    current_weight = Column(Numeric(6, 2), nullable=False)
    target_weight = Column(Numeric(6, 2), nullable=False)
    variance = Column(Numeric(6, 2))  # current - target
    action = Column(String(20), nullable=False)  # buy, sell, hold
    recommended_amount = Column(Numeric(15, 2))
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    portfolio = relationship("Portfolio", back_populates="rebalancing_recommendations")

    __table_args__ = (
        Index('idx_rebalance_portfolio', 'portfolio_id'),
    )

    def needs_rebalancing(self, tolerance: float = 2.0) -> bool:
        """Check if variance exceeds tolerance"""
        variance = float(self.variance or 0)
        return abs(variance) > tolerance

    def get_action_priority(self) -> int:
        """Get priority (0=hold, 1=buy/sell small, 2=buy/sell medium, 3=buy/sell large)"""
        variance = abs(float(self.variance or 0))
        if variance <= 1:
            return 0
        elif variance <= 3:
            return 1
        elif variance <= 5:
            return 2
        return 3
