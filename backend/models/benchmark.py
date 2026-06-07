"""Benchmark models"""
from sqlalchemy import Column, Integer, String, Numeric, Date, DateTime, ForeignKey, UniqueConstraint, Index
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from datetime import datetime, date
from database import Base


class Benchmark(Base):
    """Benchmark model - index benchmarks for comparison"""
    __tablename__ = "benchmarks"

    id = Column(Integer, primary_key=True, index=True)
    portfolio_id = Column(Integer, ForeignKey("portfolios.id"), nullable=False)
    benchmark_name = Column(String(100), nullable=False)
    benchmark_symbol = Column(String(20), nullable=False)
    benchmark_type = Column(String(50), nullable=False)  # index, etf

    # Relationships
    portfolio = relationship("Portfolio", back_populates="benchmarks")
    performance_records = relationship("BenchmarkPerformance", back_populates="benchmark", cascade="all, delete-orphan")

    __table_args__ = (
        UniqueConstraint('portfolio_id', 'benchmark_symbol', name='uq_portfolio_benchmark'),
        Index('idx_benchmarks_portfolio', 'portfolio_id'),
    )


class BenchmarkPerformance(Base):
    """BenchmarkPerformance model - benchmark price history and returns"""
    __tablename__ = "benchmark_performance"

    id = Column(Integer, primary_key=True, index=True)
    benchmark_id = Column(Integer, ForeignKey("benchmarks.id"), nullable=False)
    performance_date = Column(Date, nullable=False)
    price = Column(Numeric(15, 4), nullable=False)
    returns_percentage = Column(Numeric(10, 4))  # daily/period returns
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    benchmark = relationship("Benchmark", back_populates="performance_records")

    __table_args__ = (
        UniqueConstraint('benchmark_id', 'performance_date', name='uq_benchmark_performance_date'),
        Index('idx_bench_perf_benchmark', 'benchmark_id'),
        Index('idx_bench_perf_date', 'performance_date'),
    )

    def get_return_amount(self) -> float:
        """Get return as decimal (e.g., 2.5 for 2.5%)"""
        return float(self.returns_percentage or 0)
