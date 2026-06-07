"""Create analytics tables for portfolio management and financial analysis

Revision: 20260607_001
Date: 2026-06-07

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


def upgrade() -> None:
    # Create portfolios table
    op.create_table(
        'portfolios',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('clinic_id', sa.Integer(), nullable=False),
        sa.Column('portfolio_name', sa.String(255), nullable=False),
        sa.Column('currency', sa.String(3), server_default='BRL'),
        sa.Column('initial_investment', sa.Numeric(15, 2), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('active', sa.Boolean(), server_default='true'),
        sa.ForeignKeyConstraint(['clinic_id'], ['clinics.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('clinic_id', 'portfolio_name', name='uq_clinic_portfolio_name')
    )
    op.create_index('idx_portfolios_clinic', 'portfolios', ['clinic_id'])

    # Create assets table
    op.create_table(
        'assets',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('portfolio_id', sa.Integer(), nullable=False),
        sa.Column('symbol', sa.String(20), nullable=False),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('asset_class', sa.String(50), nullable=False),
        sa.Column('sector', sa.String(100)),
        sa.Column('currency', sa.String(3), server_default='BRL'),
        sa.Column('current_price', sa.Numeric(15, 4)),
        sa.Column('last_price_update', sa.DateTime(timezone=True)),
        sa.ForeignKeyConstraint(['portfolio_id'], ['portfolios.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('portfolio_id', 'symbol', name='uq_portfolio_symbol')
    )
    op.create_index('idx_assets_portfolio', 'assets', ['portfolio_id'])
    op.create_index('idx_assets_symbol', 'assets', ['symbol'])

    # Create transactions table
    op.create_table(
        'transactions',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('asset_id', sa.Integer(), nullable=False),
        sa.Column('transaction_type', sa.String(10), nullable=False),
        sa.Column('quantity', sa.Numeric(15, 6), nullable=False),
        sa.Column('price', sa.Numeric(15, 4), nullable=False),
        sa.Column('total_value', sa.Numeric(15, 2), nullable=False),
        sa.Column('fee', sa.Numeric(15, 2), server_default='0'),
        sa.Column('tax', sa.Numeric(15, 2), server_default='0'),
        sa.Column('net_value', sa.Numeric(15, 2), nullable=False),
        sa.Column('transaction_date', sa.Date(), nullable=False),
        sa.Column('settlement_date', sa.Date()),
        sa.Column('notes', sa.Text()),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.ForeignKeyConstraint(['asset_id'], ['assets.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('idx_transactions_asset', 'transactions', ['asset_id'])
    op.create_index('idx_transactions_date', 'transactions', ['transaction_date'])
    op.create_index('idx_transactions_type', 'transactions', ['transaction_type'])

    # Create portfolio_performance_snapshots table
    op.create_table(
        'portfolio_performance_snapshots',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('portfolio_id', sa.Integer(), nullable=False),
        sa.Column('snapshot_date', sa.Date(), nullable=False),
        sa.Column('total_value', sa.Numeric(15, 2), nullable=False),
        sa.Column('invested_value', sa.Numeric(15, 2), nullable=False),
        sa.Column('total_gains', sa.Numeric(15, 2)),
        sa.Column('unrealized_gains', sa.Numeric(15, 2)),
        sa.Column('realized_gains', sa.Numeric(15, 2)),
        sa.Column('roi_percentage', sa.Numeric(10, 4)),
        sa.Column('cash_balance', sa.Numeric(15, 2), server_default='0'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.ForeignKeyConstraint(['portfolio_id'], ['portfolios.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('portfolio_id', 'snapshot_date', name='uq_portfolio_snapshot_date')
    )
    op.create_index('idx_snapshots_portfolio', 'portfolio_performance_snapshots', ['portfolio_id'])
    op.create_index('idx_snapshots_date', 'portfolio_performance_snapshots', ['snapshot_date'])

    # Create asset_allocations table
    op.create_table(
        'asset_allocations',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('portfolio_id', sa.Integer(), nullable=False),
        sa.Column('snapshot_date', sa.Date(), nullable=False),
        sa.Column('asset_id', sa.Integer(), nullable=False),
        sa.Column('quantity', sa.Numeric(15, 6), nullable=False),
        sa.Column('current_price', sa.Numeric(15, 4), nullable=False),
        sa.Column('market_value', sa.Numeric(15, 2), nullable=False),
        sa.Column('weight_percentage', sa.Numeric(6, 2)),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.ForeignKeyConstraint(['portfolio_id'], ['portfolios.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['asset_id'], ['assets.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('portfolio_id', 'snapshot_date', 'asset_id', name='uq_portfolio_snapshot_asset')
    )
    op.create_index('idx_allocations_portfolio', 'asset_allocations', ['portfolio_id'])
    op.create_index('idx_allocations_snapshot_date', 'asset_allocations', ['snapshot_date'])

    # Create benchmarks table
    op.create_table(
        'benchmarks',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('portfolio_id', sa.Integer(), nullable=False),
        sa.Column('benchmark_name', sa.String(100), nullable=False),
        sa.Column('benchmark_symbol', sa.String(20), nullable=False),
        sa.Column('benchmark_type', sa.String(50), nullable=False),
        sa.ForeignKeyConstraint(['portfolio_id'], ['portfolios.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('portfolio_id', 'benchmark_symbol', name='uq_portfolio_benchmark')
    )
    op.create_index('idx_benchmarks_portfolio', 'benchmarks', ['portfolio_id'])

    # Create benchmark_performance table
    op.create_table(
        'benchmark_performance',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('benchmark_id', sa.Integer(), nullable=False),
        sa.Column('performance_date', sa.Date(), nullable=False),
        sa.Column('price', sa.Numeric(15, 4), nullable=False),
        sa.Column('returns_percentage', sa.Numeric(10, 4)),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.ForeignKeyConstraint(['benchmark_id'], ['benchmarks.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('benchmark_id', 'performance_date', name='uq_benchmark_performance_date')
    )
    op.create_index('idx_bench_perf_benchmark', 'benchmark_performance', ['benchmark_id'])
    op.create_index('idx_bench_perf_date', 'benchmark_performance', ['performance_date'])

    # Create tax_lots table
    op.create_table(
        'tax_lots',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('asset_id', sa.Integer(), nullable=False),
        sa.Column('purchase_date', sa.Date(), nullable=False),
        sa.Column('quantity', sa.Numeric(15, 6), nullable=False),
        sa.Column('cost_per_unit', sa.Numeric(15, 4), nullable=False),
        sa.Column('total_cost', sa.Numeric(15, 2), nullable=False),
        sa.Column('quantity_sold', sa.Numeric(15, 6), server_default='0'),
        sa.Column('remaining_quantity', sa.Numeric(15, 6)),
        sa.Column('acquisition_status', sa.String(20), server_default='open'),
        sa.Column('cost_basis_method', sa.String(20), server_default='fifo'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.ForeignKeyConstraint(['asset_id'], ['assets.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('idx_tax_lots_asset', 'tax_lots', ['asset_id'])
    op.create_index('idx_tax_lots_status', 'tax_lots', ['acquisition_status'])

    # Create capital_gains_reports table
    op.create_table(
        'capital_gains_reports',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('portfolio_id', sa.Integer(), nullable=False),
        sa.Column('tax_year', sa.Integer(), nullable=False),
        sa.Column('tax_period', sa.String(20), nullable=False),
        sa.Column('short_term_gains', sa.Numeric(15, 2), server_default='0'),
        sa.Column('long_term_gains', sa.Numeric(15, 2), server_default='0'),
        sa.Column('total_realized_gains', sa.Numeric(15, 2), server_default='0'),
        sa.Column('total_fees', sa.Numeric(15, 2), server_default='0'),
        sa.Column('total_taxes_paid', sa.Numeric(15, 2), server_default='0'),
        sa.Column('total_transactions_count', sa.Integer(), server_default='0'),
        sa.Column('total_sales_amount', sa.Numeric(15, 2), server_default='0'),
        sa.Column('report_generated_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.ForeignKeyConstraint(['portfolio_id'], ['portfolios.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('portfolio_id', 'tax_year', 'tax_period', name='uq_portfolio_year_period')
    )
    op.create_index('idx_capital_gains_portfolio', 'capital_gains_reports', ['portfolio_id'])
    op.create_index('idx_capital_gains_year', 'capital_gains_reports', ['tax_year'])

    # Create portfolio_rebalancing_recommendations table
    op.create_table(
        'portfolio_rebalancing_recommendations',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('portfolio_id', sa.Integer(), nullable=False),
        sa.Column('asset_class', sa.String(50), nullable=False),
        sa.Column('current_weight', sa.Numeric(6, 2), nullable=False),
        sa.Column('target_weight', sa.Numeric(6, 2), nullable=False),
        sa.Column('variance', sa.Numeric(6, 2)),
        sa.Column('action', sa.String(20), nullable=False),
        sa.Column('recommended_amount', sa.Numeric(15, 2)),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.ForeignKeyConstraint(['portfolio_id'], ['portfolios.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('idx_rebalance_portfolio', 'portfolio_rebalancing_recommendations', ['portfolio_id'])


def downgrade() -> None:
    op.drop_index('idx_rebalance_portfolio', table_name='portfolio_rebalancing_recommendations')
    op.drop_table('portfolio_rebalancing_recommendations')

    op.drop_index('idx_capital_gains_year', table_name='capital_gains_reports')
    op.drop_index('idx_capital_gains_portfolio', table_name='capital_gains_reports')
    op.drop_table('capital_gains_reports')

    op.drop_index('idx_tax_lots_status', table_name='tax_lots')
    op.drop_index('idx_tax_lots_asset', table_name='tax_lots')
    op.drop_table('tax_lots')

    op.drop_index('idx_bench_perf_date', table_name='benchmark_performance')
    op.drop_index('idx_bench_perf_benchmark', table_name='benchmark_performance')
    op.drop_table('benchmark_performance')

    op.drop_index('idx_benchmarks_portfolio', table_name='benchmarks')
    op.drop_table('benchmarks')

    op.drop_index('idx_allocations_snapshot_date', table_name='asset_allocations')
    op.drop_index('idx_allocations_portfolio', table_name='asset_allocations')
    op.drop_table('asset_allocations')

    op.drop_index('idx_snapshots_date', table_name='portfolio_performance_snapshots')
    op.drop_index('idx_snapshots_portfolio', table_name='portfolio_performance_snapshots')
    op.drop_table('portfolio_performance_snapshots')

    op.drop_index('idx_transactions_type', table_name='transactions')
    op.drop_index('idx_transactions_date', table_name='transactions')
    op.drop_index('idx_transactions_asset', table_name='transactions')
    op.drop_table('transactions')

    op.drop_index('idx_assets_symbol', table_name='assets')
    op.drop_index('idx_assets_portfolio', table_name='assets')
    op.drop_table('assets')

    op.drop_index('idx_portfolios_clinic', table_name='portfolios')
    op.drop_table('portfolios')
