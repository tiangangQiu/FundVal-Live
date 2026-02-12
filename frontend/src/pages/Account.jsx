import React, { useState, useMemo, useCallback } from 'react';
import { Plus, Edit2, Trash2, RefreshCw, ArrowUpDown, ChevronDown, Download } from 'lucide-react';
import { Alert, Button, Card, Dropdown, Grid, message, Popconfirm, Space, Table } from 'antd';
import { getRateColor } from '../components/StatCard';
import { PortfolioChart } from '../components/PortfolioChart';
import { useAccountData } from '../hooks/useAccountData';
import { usePositions, SORT_OPTIONS } from '../hooks/usePositions';
import { PositionModal, AddPositionModal, ReducePositionModal } from '../components/TradeModal';

/** 行内预估收益与是否有效预估 */
function getDisplayDayIncome(pos) {
  return pos.is_est_valid
    ? pos.day_income
    : (pos.estimate > 0 ? (pos.estimate - pos.nav) * pos.shares : 0);
}

const Account = ({ currentAccount = 1, onSelectFund, onPositionChange, onSyncWatchlist, syncLoading, isActive }) => {
  const breakpoint = Grid.useBreakpoint();
  const isMd = breakpoint.md === true; // 仅 md 及以上用宽表；默认窄表，移动端不撑破视口
  const { data, loading, error, refetch } = useAccountData(currentAccount, isActive);
  const {
    sortOption,
    setSortOption,
    sortPositions,
    submitting,
    navUpdating,
    syncLoading: positionSyncLoading,
    handleUpdatePosition,
    handleDeletePosition,
    handleAddPosition,
    handleReducePosition,
    handleUpdateNav,
    handleSyncWatchlist
  } = usePositions(currentAccount, onPositionChange, onSyncWatchlist, refetch);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingPos, setEditingPos] = useState(null);
  const [addModalPos, setAddModalPos] = useState(null);
  const [reduceModalPos, setReduceModalPos] = useState(null);

  const isAggregatedView = currentAccount === 0;
  const { summary, positions } = data;
  const displayPositions = positions || [];

  const sortedPositions = sortPositions(displayPositions);

  const handleOpenModal = useCallback((pos = null) => {
    setEditingPos(pos);
    setModalOpen(true);
  }, []);

  const handleSubmitPosition = useCallback(async (formData) => {
    try {
      await handleUpdatePosition(formData);
      setModalOpen(false);
      message.success('保存成功');
    } catch (e) {
      message.error('保存失败');
    }
  }, [handleUpdatePosition]);

  const handleSync = useCallback(() => {
    handleSyncWatchlist(positions);
  }, [handleSyncWatchlist, positions]);

  const handleDeleteConfirm = useCallback(async (code) => {
    try {
      await handleDeletePosition(code);
      message.success('删除成功');
    } catch (e) {
      const msg = e.response?.data?.detail || e.message || '删除失败';
      message.error(typeof msg === 'string' ? msg : '删除失败');
    }
  }, [handleDeletePosition]);

  const sortMenuItems = useMemo(() => SORT_OPTIONS.map((option, index) => ({
    key: String(index),
    label: option.label
  })), []);

  const tableColumns = useMemo(() => [
    {
      title: (
        <>
          <div className="text-[15px]">基金信息</div>
          <div className="text-xs text-slate-400 normal-case mt-0.5 hidden md:block">持有总收益%</div>
        </>
      ),
      key: 'fund',
      width: 200,
      render: (_, pos) => (
        <div
          className="cursor-pointer group max-w-[200px] account-fund-cell"
          onClick={() => onSelectFund?.(pos.code)}
        >
          <div className="min-w-0">
            <div className={`font-medium text-slate-800 group-hover:text-blue-600 transition-colors truncate ${isMd ? 'text-[15px]' : 'text-[13px] leading-tight'}`} title={pos.name}>
              {pos.name}
            </div>
            <div className={`flex items-center gap-1 mt-0.5 flex-nowrap min-w-0 ${isMd ? 'text-[13px]' : 'text-[11px]'}`}>
              <span className="text-slate-400 font-mono shrink-0">{pos.code}</span>
              <span className={`font-semibold shrink-0 ${getRateColor(pos.accumulated_return_rate)}`}>
                {pos.accumulated_return_rate > 0 ? '+' : ''}{pos.accumulated_return_rate.toFixed(2)}%
              </span>
            </div>
          </div>
        </div>
      )
    },
    {
      title: (
        <>
          <div className="text-[15px]">预估收益</div>
          <div className="text-xs text-slate-400 normal-case mt-0.5 hidden md:block">涨跌%</div>
        </>
      ),
      key: 'dayIncome',
      align: 'right',
      width: 78,
      render: (_, pos) => {
        const displayDayIncome = getDisplayDayIncome(pos);
        const hasValidEstimate = pos.estimate > 0;
        const amountStr = hasValidEstimate ? (displayDayIncome > 0 ? '+' : '') + displayDayIncome.toFixed(2) + (!pos.is_est_valid ? '*' : '') : '--';
        const rateStr = hasValidEstimate ? (pos.est_rate > 0 ? '+' : '') + pos.est_rate.toFixed(2) + '%' + (!pos.is_est_valid ? '*' : '') : '--';
        return (
          <div className="font-mono text-right account-table-cell">
            {isMd ? (
              <>
                <div className={`text-[14px] font-medium ${!hasValidEstimate ? 'text-slate-300' : getRateColor(displayDayIncome)}`}>
                  {amountStr}
                </div>
                <div className={`text-[13px] mt-0.5 ${!hasValidEstimate ? 'text-slate-300' : getRateColor(pos.est_rate)}`}>
                  {rateStr}
                </div>
              </>
            ) : (
              <div className="text-[12px] leading-tight">
                <div className={`font-medium ${!hasValidEstimate ? 'text-slate-300' : getRateColor(displayDayIncome)}`}>
                  {amountStr}
                </div>
                <div className={`text-[10px] ${!hasValidEstimate ? 'text-slate-300' : getRateColor(pos.est_rate)}`}>
                  {rateStr}
                </div>
              </div>
            )}
          </div>
        );
      }
    },
    {
      title: (
        <>
          <div className="text-[15px]">实际总值</div>
          <div className="text-xs text-slate-400 normal-case mt-0.5 hidden md:block">实际收益</div>
        </>
      ),
      key: 'marketValue',
      align: 'right',
      width: 100,
      render: (_, pos) => (
        <div className="font-mono text-right account-table-cell">
          {isMd ? (
            <>
              <div className="text-[14px] text-slate-800 font-medium">
                {pos.nav_market_value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div className={`text-[13px] mt-0.5 ${getRateColor(pos.accumulated_income)}`}>
                {pos.accumulated_income > 0 ? '+' : ''}{pos.accumulated_income.toFixed(2)}
              </div>
            </>
          ) : (
            <div className="text-[12px] leading-tight">
              <div className="text-slate-800 font-medium">
                {pos.nav_market_value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div className={`text-[10px] ${getRateColor(pos.accumulated_income)}`}>
                {pos.accumulated_income > 0 ? '+' : ''}{pos.accumulated_income.toFixed(2)}
              </div>
            </div>
          )}
        </div>
      )
    },
    {
      title: (
        <>
          <div className="text-[15px]">预估总收益</div>
          <div className="text-xs text-slate-400 normal-case mt-0.5">预估总收益%</div>
        </>
      ),
      key: 'totalIncome',
      align: 'right',
      width: 88,
      responsive: ['md'],
      render: (_, pos) => (
        <div className="font-mono text-right account-table-cell">
          <div className={`text-[14px] font-medium ${getRateColor(pos.total_income)}`}>
            {pos.total_income > 0 ? '+' : ''}{pos.total_income.toFixed(2)}
          </div>
          <div className={`text-[13px] mt-0.5 ${getRateColor(pos.total_return_rate)}`}>
            {pos.total_return_rate > 0 ? '+' : ''}{pos.total_return_rate.toFixed(2)}%
          </div>
        </div>
      )
    },
    {
      title: (
        <>
          <div className="text-[15px]">份额</div>
          <div className="text-xs text-slate-400 normal-case mt-0.5">成本</div>
        </>
      ),
      key: 'shares',
      align: 'right',
      width: 82,
      responsive: ['md'],
      render: (_, pos) => (
        <div className="font-mono text-slate-600 text-right account-table-cell">
          <div className="text-[14px]">{pos.shares.toLocaleString()}</div>
          <div className="text-[13px] text-slate-400 mt-0.5">{pos.cost.toFixed(4)}</div>
        </div>
      )
    },
    {
      title: <span className="text-[15px]">操作</span>,
      key: 'actions',
      align: 'center',
      width: 100,
      responsive: ['md'],
      render: (_, pos) => (
        <div className="flex justify-center gap-0.5">
          {!isAggregatedView && (
            <Space size={4}>
              <Button
                type="text"
                size="small"
                icon={<Edit2 className="w-4 h-4" />}
                onClick={(e) => { e.stopPropagation(); handleOpenModal(pos); }}
                title="修改持仓"
                className="text-slate-400 hover:text-blue-600 hover:bg-blue-50"
              />
              <Popconfirm
                title="确定删除该持仓吗？"
                onConfirm={(e) => { e?.stopPropagation?.(); return handleDeleteConfirm(pos.code); }}
                okText="删除"
                cancelText="取消"
              >
                <Button
                  type="text"
                  size="small"
                  danger
                  icon={<Trash2 className="w-4 h-4" />}
                  title="删除"
                  onClick={(e) => e.stopPropagation()}
                  className="text-slate-400 hover:text-red-600 hover:bg-red-50"
                />
              </Popconfirm>
            </Space>
          )}
          {isAggregatedView && <span className="text-xs text-slate-400">仅查看</span>}
        </div>
      )
    }
  ], [isMd, isAggregatedView, onSelectFund, handleOpenModal, handleDeleteConfirm]);

  return (
    <div className="space-y-6">
      {isAggregatedView && (
        <Alert
          message="正在查看全部账户的汇总数据"
          description="相同基金的持仓已自动合并（份额相加，成本加权平均）。汇总视图仅供查看，不支持修改操作。"
          type="info"
          showIcon
        />
      )}

      {error && (
        <Alert
          message={error}
          type="error"
          showIcon
          action={
            <Button size="small" danger onClick={() => refetch()}>
              重试
            </Button>
          }
        />
      )}

      {loading && !data.positions?.length ? (
        <div className="w-full bg-white rounded-2xl p-6 shadow-sm border border-slate-100 animate-pulse">
          <div className="h-8 bg-slate-200 rounded w-1/3 mb-4" />
          <div className="h-32 bg-slate-200 rounded mb-4" />
          <div className="grid grid-cols-3 gap-4">
            <div className="h-20 bg-slate-200 rounded" />
            <div className="h-20 bg-slate-200 rounded" />
            <div className="h-20 bg-slate-200 rounded" />
          </div>
        </div>
      ) : (
        <div className="w-full">
          <PortfolioChart positions={positions} summary={summary} loading={loading} onRefresh={refetch} />
        </div>
      )}

      <Card
        title={isAggregatedView ? '全部账户持仓汇总' : '持仓明细'}
        className="shadow-sm account-card"
        extra={
          <div className="account-card-actions flex items-center gap-1 flex-nowrap overflow-x-auto max-w-full">
            <Dropdown
              menu={{ items: sortMenuItems, onClick: ({ key }) => setSortOption(SORT_OPTIONS[Number(key)]) }}
              trigger={['click']}
              placement="bottomEnd"
            >
              <Button size="small" icon={<ArrowUpDown className="w-3.5 h-3.5" />} className="account-action-btn">
                排序 <ChevronDown className="w-3 h-3 ml-0.5" />
              </Button>
            </Dropdown>
            <Button
              size="small"
              icon={<RefreshCw className={`w-3.5 h-3.5 ${(syncLoading || positionSyncLoading) ? 'animate-spin' : ''}`} />}
              onClick={handleSync}
              disabled={syncLoading || positionSyncLoading}
              title="将持仓基金添加到关注列表"
              className="account-action-btn"
            >
              <span className="hidden sm:inline">同步关注</span>
              <span className="sm:hidden">同步</span>
            </Button>
            <Button
              size="small"
              icon={<Download className={`w-3.5 h-3.5 ${navUpdating ? 'animate-spin' : ''}`} />}
              onClick={handleUpdateNav}
              disabled={navUpdating}
              title="手动更新所有持仓基金的净值"
              className="account-action-btn"
            >
              <span className="hidden sm:inline">更新净值</span>
              <span className="sm:hidden">净值</span>
            </Button>
            {!isAggregatedView && (
              <Button type="primary" size="small" icon={<Plus className="w-3.5 h-3.5" />} onClick={() => handleOpenModal()} className="account-action-btn shrink-0">
                记一笔
              </Button>
            )}
          </div>
        }
      >
        <div className="overflow-x-auto -mx-3 px-3 sm:mx-0 sm:px-0 max-w-full">
          <Table
            rowKey="code"
            columns={tableColumns}
            dataSource={sortedPositions}
            pagination={false}
            size="small"
            scroll={{ x: isMd ? 648 : undefined }}
            className="account-positions-table"
            locale={{ emptyText: '暂无持仓，快去记一笔吧' }}
          />
        </div>
      </Card>

      <PositionModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSubmit={handleSubmitPosition}
        editingPos={editingPos}
        submitting={submitting}
        onOpenAdd={setAddModalPos}
        onOpenReduce={setReduceModalPos}
        currentAccount={currentAccount}
      />
      <AddPositionModal
        isOpen={!!addModalPos}
        onClose={() => setAddModalPos(null)}
        onSubmit={handleAddPosition}
        position={addModalPos}
        submitting={submitting}
      />
      <ReducePositionModal
        isOpen={!!reduceModalPos}
        onClose={() => setReduceModalPos(null)}
        onSubmit={handleReducePosition}
        position={reduceModalPos}
        submitting={submitting}
      />
    </div>
  );
};

export default Account;
