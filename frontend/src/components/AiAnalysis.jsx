import React, { useState, useEffect } from 'react';
import { Bot, Sparkles, AlertTriangle, TrendingUp, TrendingDown, RefreshCcw, Brain, ChevronDown, ChevronUp, History, Clock, Trash2, CheckCircle, XCircle } from 'lucide-react';
import { api, getPrompts, getAnalysisHistory, getAnalysisHistoryDetail, deleteAnalysisHistory } from '../services/api';
import ReactMarkdown from 'react-markdown';

// Parse markdown content and extract <think> blocks
const parseThinkBlocks = (markdown) => {
  if (!markdown) return [{ type: 'markdown', content: '' }];

  const blocks = [];
  const thinkRegex = /<think>([\s\S]*?)<\/think>/g;
  let lastIndex = 0;
  let match;

  while ((match = thinkRegex.exec(markdown)) !== null) {
    // Add markdown content before this think block
    if (match.index > lastIndex) {
      const markdownContent = markdown.slice(lastIndex, match.index).trim();
      if (markdownContent) {
        blocks.push({ type: 'markdown', content: markdownContent });
      }
    }

    // Add think block
    blocks.push({ type: 'think', content: match[1].trim() });
    lastIndex = thinkRegex.lastIndex;
  }

  // Add remaining markdown content
  if (lastIndex < markdown.length) {
    const markdownContent = markdown.slice(lastIndex).trim();
    if (markdownContent) {
      blocks.push({ type: 'markdown', content: markdownContent });
    }
  }

  return blocks.length > 0 ? blocks : [{ type: 'markdown', content: markdown }];
};

// ThinkBlock component with collapse/expand functionality
const ThinkBlock = ({ content }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="my-4 border border-slate-200 rounded-lg overflow-hidden bg-slate-50">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-slate-100 transition-colors"
      >
        <div className="flex items-center gap-2 text-slate-600">
          <Brain className="w-4 h-4" />
          <span className="text-sm font-medium">AI 思考过程</span>
        </div>
        {isExpanded ? (
          <ChevronUp className="w-4 h-4 text-slate-400" />
        ) : (
          <ChevronDown className="w-4 h-4 text-slate-400" />
        )}
      </button>

      {isExpanded && (
        <div className="px-4 py-3 border-t border-slate-200 bg-white">
          <div className="prose prose-sm max-w-none text-slate-600 text-xs">
            <ReactMarkdown>{content}</ReactMarkdown>
          </div>
        </div>
      )}
    </div>
  );
};


export const AiAnalysis = ({ fund }) => {
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [prompts, setPrompts] = useState([]);
  const [selectedPromptId, setSelectedPromptId] = useState(null);
  const [showHistory, setShowHistory] = useState(false);
  const [historyRecords, setHistoryRecords] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [selectedHistory, setSelectedHistory] = useState(null);
  const [canAnalyze, setCanAnalyze] = useState(true);
  const [countdown, setCountdown] = useState(0);

  useEffect(() => {
    loadPrompts();
  }, []);

  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    } else {
      setCanAnalyze(true);
    }
  }, [countdown]);

  const loadPrompts = async () => {
    try {
      const data = await getPrompts();
      setPrompts(data);
      // Set default prompt as selected
      const defaultPrompt = data.find(p => p.is_default);
      if (defaultPrompt) {
        setSelectedPromptId(defaultPrompt.id);
      }
    } catch (error) {
      console.error('Load prompts failed', error);
    }
  };

  const handleAnalyze = async () => {
    if (!canAnalyze) return;

    setLoading(true);
    setError(null);
    setAnalysis(null);
    setCanAnalyze(false);
    setCountdown(3);

    try {
      const response = await api.post('/ai/analyze_fund', {
        fund_info: fund,
        prompt_id: selectedPromptId
      });
      console.log('AI Analysis Response:', response.data);
      setAnalysis(response.data);

      // Reload history if visible
      setTimeout(() => {
        if (showHistory) {
          loadHistory();
        }
      }, 500);
    } catch (err) {
      const errorMsg = err.response?.data?.detail || err.message || '分析请求失败，请稍后重试';
      console.error('AI Analysis Error:', err);
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const loadHistory = async () => {
    setHistoryLoading(true);
    try {
      const fundCode = fund.id || fund.code;
      if (!fundCode) {
        console.error('[ERROR] No fund code available!', fund);
        return;
      }

      const records = await getAnalysisHistory(fundCode, fund.account_id || 1, {
        limit: 20,
        offset: 0
      });

      setHistoryRecords(records);
    } catch (err) {
      console.error('Load history failed', err);
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleViewHistory = async (id) => {
    try {
      const detail = await getAnalysisHistoryDetail(id);
      setSelectedHistory(detail);
      setAnalysis({
        markdown: detail.markdown,
        indicators: detail.indicators_json ? JSON.parse(detail.indicators_json) : null,
        timestamp: new Date(detail.created_at).toLocaleTimeString()
      });
    } catch (err) {
      console.error('Load history detail failed', err);
    }
  };

  const handleDeleteHistory = async (id) => {
    if (!confirm('确定删除这条历史记录？')) return;

    try {
      await deleteAnalysisHistory(id);
      setHistoryRecords(historyRecords.filter(r => r.id !== id));
      if (selectedHistory?.id === id) {
        setSelectedHistory(null);
        setAnalysis(null);
      }
    } catch (err) {
      console.error('Delete history failed', err);
      alert('删除失败');
    }
  };

  const toggleHistory = () => {
    const newShowHistory = !showHistory;
    setShowHistory(newShowHistory);
    if (newShowHistory && historyRecords.length === 0) {
      loadHistory();
    }
  };

  const getRiskColor = (level) => {
    if (!level) return 'text-slate-500 bg-slate-100';
    if (level.includes('高')) return 'text-red-600 bg-red-50 border-red-100';
    if (level.includes('中')) return 'text-orange-600 bg-orange-50 border-orange-100';
    return 'text-green-600 bg-green-50 border-green-100';
  };

  // Extract risk level from markdown (look for ##  风险等级 section)
  const extractRiskLevel = (markdown) => {
    if (!markdown) return null;
    const match = markdown.match(/##\s*\s*风险等级\s*\n([^\n]+)/);
    return match ? match[1].trim() : null;
  };

  if (!analysis && !loading) {
    return (
      <div className="bg-gradient-to-br from-indigo-50 to-white rounded-2xl p-6 shadow-sm border border-indigo-100">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Bot className="w-6 h-6 text-indigo-600" />
            <h3 className="text-lg font-bold text-slate-800">AI 深度市场分析</h3>
          </div>
          <button
            onClick={toggleHistory}
            className="text-sm text-slate-600 hover:text-indigo-600 flex items-center gap-1 transition-colors"
          >
            <History className="w-4 h-4" />
            {showHistory ? '隐藏历史' : '查看历史'}
          </button>
        </div>

        {showHistory && (
          <div className="mb-6 border-t border-slate-200 pt-4">
            <h4 className="text-sm font-medium text-slate-700 mb-3">历史记录</h4>
            {historyLoading ? (
              <div className="text-center py-4 text-slate-400 text-sm">加载中...</div>
            ) : historyRecords.length === 0 ? (
              <div className="text-center py-4 text-slate-400 text-sm">暂无历史记录</div>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {historyRecords.map(record => (
                  <div
                    key={record.id}
                    className="flex items-center justify-between p-3 bg-white rounded-lg border border-slate-200 hover:border-indigo-300 transition-colors"
                  >
                    <div className="flex-1 cursor-pointer" onClick={() => handleViewHistory(record.id)}>
                      <div className="flex items-center gap-2 mb-1">
                        <Clock className="w-3 h-3 text-slate-400" />
                        <span className="text-xs text-slate-500">
                          {new Date(record.created_at).toLocaleString()}
                        </span>
                        {record.status === 'success' ? (
                          <CheckCircle className="w-3 h-3 text-green-500" />
                        ) : (
                          <XCircle className="w-3 h-3 text-red-500" />
                        )}
                      </div>
                      <div className="text-sm text-slate-700">{record.prompt_name}</div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteHistory(record.id);
                      }}
                      className="text-slate-400 hover:text-red-600 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="flex flex-col items-center justify-center text-center">
          <p className="text-slate-500 text-sm mb-6 max-w-md">
            基于 Linus Torvalds 风格的硬核逻辑分析。
            融合历史走势、实时估值、市场舆情，拒绝模棱两可的废话。
          </p>

          {prompts.length > 0 && (
            <div className="w-full max-w-md mb-4">
              <label className="block text-sm font-medium text-slate-700 mb-2">
                选择分析风格
              </label>
              <select
                value={selectedPromptId || ''}
                onChange={(e) => setSelectedPromptId(e.target.value ? parseInt(e.target.value) : null)}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white"
              >
                {prompts.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.name} {p.is_default ? '(默认)' : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          <button
            onClick={handleAnalyze}
            disabled={!canAnalyze}
            className={`px-6 py-2.5 rounded-full font-medium transition-all shadow-lg flex items-center gap-2 ${
              canAnalyze
                ? 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-200'
                : 'bg-slate-300 text-slate-500 cursor-not-allowed'
            }`}
          >
            <Sparkles className="w-4 h-4" />
            {countdown > 0 ? `请等待 ${countdown}秒` : '开始生成报告'}
          </button>
          {error && <p className="text-red-500 text-xs mt-4">{error}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 relative overflow-hidden">
      {/* Loading Overlay */}
      {loading && (
        <div className="absolute inset-0 bg-white/80 backdrop-blur-sm z-10 flex flex-col items-center justify-center">
          <RefreshCcw className="w-8 h-8 text-indigo-600 animate-spin mb-3" />
          <p className="text-indigo-600 font-medium animate-pulse">Linus 正在审视市场逻辑...</p>
        </div>
      )}

      {/* Header */}
      <div className="flex justify-between items-start mb-6 border-b border-slate-50 pb-4">
        <div className="flex items-center gap-3">
          <div className="bg-indigo-100 p-2 rounded-lg">
            <Bot className="w-6 h-6 text-indigo-700" />
          </div>
          <div>
            <h3 className="font-bold text-slate-800">AI 分析报告</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              生成时间: {analysis?.timestamp || '--:--'} ·
              <span className="ml-1 text-indigo-600 font-mono">Linus Mode</span>
              {selectedHistory && <span className="ml-1 text-amber-600">· 历史记录</span>}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {analysis?.indicators && (
            <div className="flex gap-2">
              {extractRiskLevel(analysis.markdown) && (
                <span className={`px-2.5 py-1 rounded text-xs font-bold border ${getRiskColor(extractRiskLevel(analysis.markdown))}`}>
                  {extractRiskLevel(analysis.markdown)}
                </span>
              )}
              <span className={`px-2.5 py-1 rounded text-xs font-bold border bg-slate-50 text-slate-600 border-slate-200`}>
                位置: {analysis.indicators.status}
              </span>
            </div>
          )}
          <button
            onClick={toggleHistory}
            className="text-sm text-slate-600 hover:text-indigo-600 flex items-center gap-1 transition-colors ml-2"
          >
            <History className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* History Panel */}
      {showHistory && (
        <div className="mb-6 border border-slate-200 rounded-lg p-4">
          <h4 className="text-sm font-medium text-slate-700 mb-3">历史记录</h4>
          {historyLoading ? (
            <div className="text-center py-4 text-slate-400 text-sm">加载中...</div>
          ) : historyRecords.length === 0 ? (
            <div className="text-center py-4 text-slate-400 text-sm">暂无历史记录</div>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {historyRecords.map(record => (
                <div
                  key={record.id}
                  className={`flex items-center justify-between p-3 rounded-lg border transition-colors ${
                    selectedHistory?.id === record.id
                      ? 'bg-indigo-50 border-indigo-300'
                      : 'bg-white border-slate-200 hover:border-indigo-300'
                  }`}
                >
                  <div className="flex-1 cursor-pointer" onClick={() => handleViewHistory(record.id)}>
                    <div className="flex items-center gap-2 mb-1">
                      <Clock className="w-3 h-3 text-slate-400" />
                      <span className="text-xs text-slate-500">
                        {new Date(record.created_at).toLocaleString()}
                      </span>
                      {record.status === 'success' ? (
                        <CheckCircle className="w-3 h-3 text-green-500" />
                      ) : (
                        <XCircle className="w-3 h-3 text-red-500" />
                      )}
                    </div>
                    <div className="text-sm text-slate-700">{record.prompt_name}</div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteHistory(record.id);
                    }}
                    className="text-slate-400 hover:text-red-600 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Indicators Section */}
      {analysis?.indicators && (
        <div className="mb-6 bg-slate-50 rounded-xl p-4 text-xs text-slate-600 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-slate-400" />
            {analysis.indicators.desc}
        </div>
      )}

      {/* Main Content - Markdown with Think Block Support */}
      {analysis?.markdown ? (
        <div className="prose prose-sm max-w-none text-slate-700">
          {parseThinkBlocks(analysis.markdown).map((block, index) => {
            if (block.type === 'think') {
              return <ThinkBlock key={index} content={block.content} />;
            } else {
              return <ReactMarkdown key={index}>{block.content}</ReactMarkdown>;
            }
          })}
        </div>
      ) : analysis ? (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
          ⚠️ AI 返回数据格式错误：缺少 markdown 字段
          <pre className="mt-2 text-xs overflow-auto">{JSON.stringify(analysis, null, 2)}</pre>
        </div>
      ) : null}
      
      {!loading && analysis && (
        <div className="mt-6 flex justify-center">
          <button
            onClick={handleAnalyze}
            disabled={!canAnalyze}
            className={`text-xs flex items-center gap-1 transition-colors ${
              canAnalyze
                ? 'text-slate-400 hover:text-indigo-600'
                : 'text-slate-300 cursor-not-allowed'
            }`}
          >
            <RefreshCcw className="w-3 h-3" />
            {countdown > 0 ? `请等待 ${countdown}秒` : '重新分析'}
          </button>
        </div>
      )}
    </div>
  );
};
