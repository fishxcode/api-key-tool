import React, { useState, useEffect } from 'react';
import { Button, Input, Typography, Table, Tag, Spin, Card, Collapse, Toast, Space, Tabs, Select, Banner, Descriptions, Pagination, BackTop } from '@douyinfe/semi-ui';
import { IconSearch, IconCopy, IconDownload } from '@douyinfe/semi-icons';
import { API, timestamp2string } from '../helpers';
import { stringToColor } from '../helpers/render';
import { ITEMS_PER_PAGE } from '../constants';
import { renderModelPrice, renderQuota } from '../helpers/render';
import Paragraph from '@douyinfe/semi-ui/lib/es/typography/paragraph';
import { Tooltip, Modal } from '@douyinfe/semi-ui';
import Papa from 'papaparse';

const { Text } = Typography;
const { Panel } = Collapse;
const { TabPane } = Tabs;
const { Option } = Select;
const API_KEY_PATTERN = /^sk-[a-zA-Z0-9]{48}$/;

function renderTimestamp(timestamp) {
    return timestamp2string(timestamp);
}

function renderIsStream(bool) {
    if (bool) {
        return <Tag color="blue" size="large">流</Tag>;
    } else {
        return <Tag color="purple" size="large">非流</Tag>;
    }
}

function renderUseTime(type) {
    const time = parseInt(type);
    if (time < 101) {
        return <Tag color="green" size="large"> {time} 秒 </Tag>;
    } else if (time < 300) {
        return <Tag color="orange" size="large"> {time} 秒 </Tag>;
    } else {
        return <Tag color="red" size="large"> {time} 秒 </Tag>;
    }
}

function sortLogsByLatest(logs = []) {
    return [...logs].sort((a, b) => b.created_at - a.created_at);
}

function parseLogOther(other) {
    if (!other) {
        return null;
    }

    if (typeof other === 'object') {
        return other;
    }

    try {
        return JSON.parse(other);
    } catch (e) {
        return null;
    }
}

function getLogStats(logs) {
    return logs.reduce((stats, log) => {
        const promptTokens = Number(log.prompt_tokens) || 0;
        const completionTokens = Number(log.completion_tokens) || 0;
        const quota = Number(log.quota) || 0;
        const cacheSummary = getCacheSummary(log.other);

        return {
            requestCount: stats.requestCount + 1,
            totalPromptTokens: stats.totalPromptTokens + promptTokens,
            totalCompletionTokens: stats.totalCompletionTokens + completionTokens,
            totalTokens: stats.totalTokens + promptTokens + completionTokens,
            totalQuota: stats.totalQuota + quota,
            totalCacheReadTokens: stats.totalCacheReadTokens + (cacheSummary?.cacheReadTokens || 0),
            totalCacheWriteTokens: stats.totalCacheWriteTokens + (cacheSummary?.cacheWriteTokens || 0),
        };
    }, {
        requestCount: 0,
        totalPromptTokens: 0,
        totalCompletionTokens: 0,
        totalTokens: 0,
        totalQuota: 0,
        totalCacheReadTokens: 0,
        totalCacheWriteTokens: 0,
    });
}

function getModelSummary(logs) {
    const modelMap = logs.reduce((acc, log) => {
        const modelName = log.model_name || 'unknown';
        const promptTokens = Number(log.prompt_tokens) || 0;
        const completionTokens = Number(log.completion_tokens) || 0;
        const quota = Number(log.quota) || 0;

        if (!acc[modelName]) {
            acc[modelName] = {
                key: modelName,
                model_name: modelName,
                request_count: 0,
                prompt_tokens: 0,
                completion_tokens: 0,
                total_tokens: 0,
                total_quota: 0,
            };
        }

        acc[modelName].request_count += 1;
        acc[modelName].prompt_tokens += promptTokens;
        acc[modelName].completion_tokens += completionTokens;
        acc[modelName].total_tokens += promptTokens + completionTokens;
        acc[modelName].total_quota += quota;

        return acc;
    }, {});

    return Object.values(modelMap).sort((a, b) => b.total_quota - a.total_quota);
}

function getFallbackRequestSummary(record) {
    const modelName = record.model_name || 'unknown';
    const promptTokens = Number(record.prompt_tokens) || 0;
    const completionTokens = Number(record.completion_tokens) || 0;
    const totalTokens = promptTokens + completionTokens;
    const quotaText = renderQuota(Number(record.quota) || 0, 6);
    const streamText = record.is_stream ? '流式' : '非流式';

    return `${modelName} | ${streamText} | 提示 ${promptTokens} | 补全 ${completionTokens} | 总 Tokens ${totalTokens} | 花费 ${quotaText}`;
}

function toPositiveNumber(value) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        return 0;
    }
    return parsed;
}

function getCacheSummary(other) {
    const parsedOther = parseLogOther(other);
    if (!parsedOther) {
        return null;
    }

    const cacheReadTokens = toPositiveNumber(parsedOther.cache_tokens);
    const cacheCreationTokens = toPositiveNumber(parsedOther.cache_creation_tokens);
    const cacheCreationTokens5m = toPositiveNumber(parsedOther.cache_creation_tokens_5m);
    const cacheCreationTokens1h = toPositiveNumber(parsedOther.cache_creation_tokens_1h);
    const hasSplitCacheCreation = cacheCreationTokens5m > 0 || cacheCreationTokens1h > 0;
    const cacheWriteTokens = hasSplitCacheCreation
        ? cacheCreationTokens5m + cacheCreationTokens1h
        : cacheCreationTokens;

    if (cacheReadTokens <= 0 && cacheWriteTokens <= 0) {
        return null;
    }

    return {
        cacheReadTokens,
        cacheWriteTokens,
        cacheCreationTokens5m,
        cacheCreationTokens1h,
        cacheRatio: parsedOther.cache_ratio,
        cacheCreationRatio: parsedOther.cache_creation_ratio,
        cacheCreationRatio5m: parsedOther.cache_creation_ratio_5m,
        cacheCreationRatio1h: parsedOther.cache_creation_ratio_1h,
    };
}

function normalizeApiKey(value) {
    return typeof value === 'string' ? value.trim() : '';
}

const BASE_URLS = JSON.parse(process.env.REACT_APP_BASE_URL);

const LogsTable = () => {
    const [apikey, setAPIKey] = useState('');
    const [activeTabKey, setActiveTabKey] = useState('');
    const [tabData, setTabData] = useState({});
    const [loading, setLoading] = useState(false);
    const [activeKeys, setActiveKeys] = useState([]);
    const [pageSize, setPageSize] = useState(ITEMS_PER_PAGE);
    const [baseUrl, setBaseUrl] = useState('');
    const [autoQueryHandled, setAutoQueryHandled] = useState(false);
    const [modelFilter, setModelFilter] = useState('');
    const [contentFilter, setContentFilter] = useState('');
    const [streamFilter, setStreamFilter] = useState('all');
    const [isMobileView, setIsMobileView] = useState(window.innerWidth <= 768);
    const [mobileCurrentPage, setMobileCurrentPage] = useState(1);

    // 只在站点上下文初始化后消费一次 URL 查询参数
    useEffect(() => {
        // 默认设置第一个地址为baseUrl
        const firstKey = Object.keys(BASE_URLS)[0];
        setActiveTabKey(firstKey);
        setBaseUrl(BASE_URLS[firstKey]);
    }, []);

    const handleTabChange = (key) => {
        setActiveTabKey(key);
        setBaseUrl(BASE_URLS[key]);
    };

    const resetData = (key) => {
        setTabData((prevData) => ({
            ...prevData,
            [key]: {
                totalGranted: 0,
                totalUsed: 0,
                totalAvailable: 0,
                unlimitedQuota: false,
                expiresAt: 0,
                tokenName: '',
                logs: [],
                tokenValid: false,
            }
        }));
    };

    const fetchData = async (token = apikey, targetBaseUrl = baseUrl, targetTabKey = activeTabKey) => {
        const normalizedToken = normalizeApiKey(token);

        if (normalizedToken === '') {
            Toast.warning('请先输入令牌，再进行查询');
            return;
        }

        if (!API_KEY_PATTERN.test(normalizedToken)) {
            Toast.error('令牌格式非法！');
            return;
        }

        setLoading(true);
        let newTabData = { ...tabData[targetTabKey], totalGranted: 0, totalUsed: 0, totalAvailable: 0, unlimitedQuota: false, expiresAt: 0, tokenName: '', logs: [], tokenValid: false };

        try {

            if (process.env.REACT_APP_SHOW_BALANCE === "true") {
                const usageRes = await API.get(`${targetBaseUrl}/api/usage/token/`, {
                    headers: { Authorization: `Bearer ${normalizedToken}` },
                });
                const usageData = usageRes.data;
                if (usageData.code) {
                    const d = usageData.data;
                    newTabData.unlimitedQuota = d.unlimited_quota;
                    newTabData.totalGranted = d.total_granted;
                    newTabData.totalUsed = d.total_used;
                    newTabData.totalAvailable = d.total_available;
                    newTabData.expiresAt = d.expires_at;
                    newTabData.tokenName = d.name;
                    newTabData.tokenValid = true;
                } else {
                    Toast.error(usageData.message || '查询令牌信息失败');
                }
            }
        } catch (e) {
            console.log(e)
            Toast.error("查询令牌信息失败，请检查令牌是否正确");
            resetData(targetTabKey); // 如果发生错误，重置所有数据为默认值
            setLoading(false);
            return;
        }
        try {
            if (process.env.REACT_APP_SHOW_DETAIL === "true") {
                const logRes = await API.get(`${targetBaseUrl}/api/log/token`, {
                    headers: { Authorization: `Bearer ${normalizedToken}` },
                });
                const { success, data: logData } = logRes.data;
                if (success) {
                    newTabData.logs = sortLogsByLatest(logData);
                    setActiveKeys(['1', '2']); // 自动展开两个折叠面板
                } else {
                    Toast.error('查询调用详情失败，请输入正确的令牌');
                }
            }
        } catch (e) {
            Toast.error("查询失败，请输入正确的令牌");
            resetData(targetTabKey); // 如果发生错误，重置所有数据为默认值
            setLoading(false);
            return;
        }
        setTabData((prevData) => ({
            ...prevData,
            [targetTabKey]: newTabData,
        }));
        setLoading(false);

    };

    useEffect(() => {
        if (!activeTabKey || !baseUrl || autoQueryHandled) {
            return;
        }

        const searchParams = new URLSearchParams(window.location.search);
        const sharedKey = normalizeApiKey(searchParams.get('key'));
        const sharedSite = searchParams.get('site');

        if (!sharedKey) {
            setAutoQueryHandled(true);
            return;
        }

        if (!API_KEY_PATTERN.test(sharedKey)) {
            Toast.error('链接中的令牌格式非法');
            setAutoQueryHandled(true);
            return;
        }

        if (sharedSite && BASE_URLS[sharedSite] && sharedSite !== activeTabKey) {
            setActiveTabKey(sharedSite);
            setBaseUrl(BASE_URLS[sharedSite]);
            return;
        }

        setAPIKey(sharedKey);
        setAutoQueryHandled(true);
        fetchData(sharedKey, baseUrl, activeTabKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTabKey, autoQueryHandled, baseUrl]);

    useEffect(() => {
        const handleResize = () => {
            setIsMobileView(window.innerWidth <= 768);
        };

        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    useEffect(() => {
        setMobileCurrentPage(1);
    }, [activeTabKey, modelFilter, contentFilter, streamFilter]);

    const copyText = async (text) => {
        try {
            // Try modern clipboard API first
            if (navigator.clipboard && window.isSecureContext) {
                await navigator.clipboard.writeText(text);
                Toast.success('已复制：' + text);
                return;
            }
            
            // Fallback for Safari and older browsers
            const textArea = document.createElement('textarea');
            textArea.value = text;
            textArea.style.position = 'fixed';
            textArea.style.left = '-999999px';
            textArea.style.top = '-999999px';
            document.body.appendChild(textArea);
            textArea.focus();
            textArea.select();
            
            try {
                document.execCommand('copy');
                textArea.remove();
                Toast.success('已复制：' + text);
            } catch (err) {
                textArea.remove();
                Modal.error({ title: '无法复制到剪贴板，请手动复制', content: text });
            }
        } catch (err) {
            Modal.error({ title: '无法复制到剪贴板，请手动复制', content: text });
        }
    };

    const columns = [
        {
            title: '时间',
            dataIndex: 'created_at',
            render: renderTimestamp,
            sorter: (a, b) => a.created_at - b.created_at,
            defaultSortOrder: 'descend',
        },
        {
            title: '令牌名称',
            dataIndex: 'token_name',
            render: (text, record, index) => {
                return record.type === 0 || record.type === 2 ? (
                    <div>
                        <Tag
                            color="grey"
                            size="large"
                            onClick={() => {
                                copyText(text);
                            }}
                        >
                            {' '}
                            {text}{' '}
                        </Tag>
                    </div>
                ) : (
                    <></>
                );
            },
            sorter: (a, b) => ('' + a.token_name).localeCompare(b.token_name),
        },
        {
            title: '模型',
            dataIndex: 'model_name',
            render: (text, record, index) => {
                return record.type === 0 || record.type === 2 ? (
                    <div>
                        <Tag
                            color={stringToColor(text)}
                            size="large"
                            onClick={() => {
                                copyText(text);
                            }}
                        >
                            {' '}
                            {text}{' '}
                        </Tag>
                    </div>
                ) : (
                    <></>
                );
            },
            sorter: (a, b) => ('' + a.model_name).localeCompare(b.model_name),
        },
        {
            title: '用时',
            dataIndex: 'use_time',
            render: (text, record, index) => {
                return record.model_name.startsWith('mj_') ? null : (
                    <div>
                        <Space>
                            {renderUseTime(text)}
                            {renderIsStream(record.is_stream)}
                        </Space>
                    </div>
                );
            },
            sorter: (a, b) => a.use_time - b.use_time,
        },
        {
            title: '总 Tokens',
            dataIndex: 'total_tokens',
            render: (text, record, index) => {
                if (record.model_name.startsWith('mj_') || (record.type !== 0 && record.type !== 2)) {
                    return <></>;
                }

                return <span>{(Number(record.prompt_tokens) || 0) + (Number(record.completion_tokens) || 0)}</span>;
            },
            sorter: (a, b) => {
                const totalA = (Number(a.prompt_tokens) || 0) + (Number(a.completion_tokens) || 0);
                const totalB = (Number(b.prompt_tokens) || 0) + (Number(b.completion_tokens) || 0);
                return totalA - totalB;
            },
        },
        {
            title: '提示',
            dataIndex: 'prompt_tokens',
            render: (text, record, index) => {
                return record.model_name.startsWith('mj_') ? null : (
                    record.type === 0 || record.type === 2 ? <div>{<span> {text} </span>}</div> : <></>
                );
            },
            sorter: (a, b) => a.prompt_tokens - b.prompt_tokens,
        },
        {
            title: '补全',
            dataIndex: 'completion_tokens',
            render: (text, record, index) => {
                return parseInt(text) > 0 && (record.type === 0 || record.type === 2) ? (
                    <div>{<span> {text} </span>}</div>
                ) : (
                    <></>
                );
            },
            sorter: (a, b) => a.completion_tokens - b.completion_tokens,
        },
        {
            title: '花费',
            dataIndex: 'quota',
            render: (text, record, index) => {
                return record.type === 0 || record.type === 2 ? <div>{renderQuota(text, 6)}</div> : <></>;
            },
            sorter: (a, b) => a.quota - b.quota,
        },
        {
            title: '缓存',
            dataIndex: 'cache',
            render: (text, record, index) => {
                const cacheSummary = getCacheSummary(record.other);
                if (!cacheSummary) {
                    return <Text type="tertiary">未命中</Text>;
                }

                return (
                    <Space wrap>
                        {cacheSummary.cacheReadTokens > 0 && (
                            <Tag color="green">缓存读 {cacheSummary.cacheReadTokens.toLocaleString()}</Tag>
                        )}
                        {cacheSummary.cacheWriteTokens > 0 && (
                            <Tag color="orange">缓存写 {cacheSummary.cacheWriteTokens.toLocaleString()}</Tag>
                        )}
                    </Space>
                );
            },
            sorter: (a, b) => {
                const cacheA = getCacheSummary(a.other);
                const cacheB = getCacheSummary(b.other);
                return ((cacheA?.cacheReadTokens || 0) + (cacheA?.cacheWriteTokens || 0))
                    - ((cacheB?.cacheReadTokens || 0) + (cacheB?.cacheWriteTokens || 0));
            },
        },
        {
            title: '缓存详情',
            dataIndex: 'cache_detail',
            render: (text, record, index) => {
                const cacheSummary = getCacheSummary(record.other);
                if (!cacheSummary) {
                    return <Text type="tertiary">暂无</Text>;
                }

                return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {cacheSummary.cacheReadTokens > 0 && (
                            <Text size="small">缓存读：{cacheSummary.cacheReadTokens.toLocaleString()}</Text>
                        )}
                        {cacheSummary.cacheWriteTokens > 0 && (
                            <Text size="small">缓存写：{cacheSummary.cacheWriteTokens.toLocaleString()}</Text>
                        )}
                        {cacheSummary.cacheCreationTokens5m > 0 && (
                            <Text size="small">5m 创建：{cacheSummary.cacheCreationTokens5m.toLocaleString()}</Text>
                        )}
                        {cacheSummary.cacheCreationTokens1h > 0 && (
                            <Text size="small">1h 创建：{cacheSummary.cacheCreationTokens1h.toLocaleString()}</Text>
                        )}
                    </div>
                );
            },
        },
        {
            title: '计费参数',
            dataIndex: 'other',
            render: (text, record, index) => {
                const other = parseLogOther(text);

                if (!other) {
                    return <Text type="tertiary">暂无</Text>;
                }

                return (
                    <Space wrap>
                        {other.model_ratio !== undefined && <Tag color="blue">模型倍率 x{other.model_ratio}</Tag>}
                        {other.completion_ratio !== undefined && <Tag color="cyan">补全倍率 x{other.completion_ratio}</Tag>}
                        {other.group_ratio !== undefined && <Tag color="purple">分组倍率 x{other.group_ratio}</Tag>}
                        {other.cache_ratio !== undefined && Number(other.cache_ratio) > 0 && (
                            <Tag color="green">缓存读倍率 x{other.cache_ratio}</Tag>
                        )}
                        {other.cache_creation_ratio !== undefined && Number(other.cache_creation_ratio) > 0 && (
                            <Tag color="orange">缓存写倍率 x{other.cache_creation_ratio}</Tag>
                        )}
                        {other.cache_creation_ratio_5m !== undefined && Number(other.cache_creation_ratio_5m) > 0 && (
                            <Tag color="orange">5m 写倍率 x{other.cache_creation_ratio_5m}</Tag>
                        )}
                        {other.cache_creation_ratio_1h !== undefined && Number(other.cache_creation_ratio_1h) > 0 && (
                            <Tag color="orange">1h 写倍率 x{other.cache_creation_ratio_1h}</Tag>
                        )}
                        {other.model_price !== undefined && Number(other.model_price) !== -1 && (
                            <Tag color="orange">固定单价 ${Number(other.model_price) * Number(other.group_ratio || 1)}</Tag>
                        )}
                    </Space>
                );
            },
        },
        {
            title: '请求摘要',
            dataIndex: 'content',
            render: (text, record, index) => {
                const summaryText = text && String(text).trim() ? text : getFallbackRequestSummary(record);
                const other = parseLogOther(record.other);
                if (record.other && !other) {
                    return (
                        <Tooltip content="该版本不支持显示计算详情">
                            <Paragraph
                                ellipsis={{
                                    rows: 2,
                                }}
                            >
                                {summaryText}
                            </Paragraph>
                        </Tooltip>
                    );
                }
                if (other == null) {
                    return (
                        <Paragraph
                            ellipsis={{
                                rows: 2,
                                showTooltip: {
                                    type: 'popover',
                                },
                            }}
                        >
                            {summaryText}
                        </Paragraph>
                    );
                }
                const content = renderModelPrice(
                    record.prompt_tokens,
                    record.completion_tokens,
                    other.model_ratio,
                    other.model_price,
                    other.completion_ratio,
                    other.group_ratio,
                );
                return (
                    <Tooltip content={content}>
                        <Paragraph
                            ellipsis={{
                                rows: 2,
                            }}
                        >
                            {summaryText}
                        </Paragraph>
                    </Tooltip>
                );
            },
        }
    ];

    const copyTokenInfo = (e) => {
        e.stopPropagation();
        const activeTabData = tabData[activeTabKey] || {};
        const { totalGranted, totalUsed, totalAvailable, unlimitedQuota, expiresAt, tokenName } = activeTabData;
        const info = `令牌名称: ${tokenName || '未知'}
令牌总额: ${unlimitedQuota ? '无限' : renderQuota(totalGranted, 3)}
剩余额度: ${unlimitedQuota ? '无限制' : renderQuota(totalAvailable, 3)}
已用额度: ${unlimitedQuota ? '不进行计算' : renderQuota(totalUsed, 3)}
有效期至: ${expiresAt === 0 ? '永不过期' : renderTimestamp(expiresAt)}`;
        copyText(info);
    };

    const exportCSV = (e) => {
        e.stopPropagation();
        const activeTabData = tabData[activeTabKey] || { logs: [] };
        const { logs } = activeTabData;
        const csvData = logs.map(log => ({
            '缓存读 Tokens': getCacheSummary(log.other)?.cacheReadTokens || 0,
            '缓存写 Tokens': getCacheSummary(log.other)?.cacheWriteTokens || 0,
            '时间': renderTimestamp(log.created_at),
            '令牌名称': log.token_name,
            '模型': log.model_name,
            '是否流式': log.is_stream ? '是' : '否',
            '用时': log.use_time,
            '提示': log.prompt_tokens,
            '补全': log.completion_tokens,
            '总 Tokens': (Number(log.prompt_tokens) || 0) + (Number(log.completion_tokens) || 0),
            '花费': log.quota,
            '计费参数': log.other,
            '请求摘要': log.content || getFallbackRequestSummary(log),
        }));
        const csvString = '\ufeff' + Papa.unparse(csvData);
        
        try {
            const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = 'data.csv';
            
            // For Safari compatibility
            if (navigator.userAgent.indexOf('Safari') > -1 && navigator.userAgent.indexOf('Chrome') === -1) {
                link.target = '_blank';
                link.setAttribute('target', '_blank');
            }
            
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            setTimeout(() => URL.revokeObjectURL(url), 100);
        } catch (err) {
            Toast.error('导出失败，请稍后重试');
            console.error('Export failed:', err);
        }
    };

    const activeTabData = tabData[activeTabKey] || { logs: [], totalGranted: 0, totalUsed: 0, totalAvailable: 0, unlimitedQuota: false, expiresAt: 0, tokenName: '', tokenValid: false };
    const filteredLogs = activeTabData.logs.filter((log) => {
        const modelMatched = !modelFilter || (log.model_name || '').toLowerCase().includes(modelFilter.toLowerCase());
        const contentMatched = !contentFilter || (log.content || '').toLowerCase().includes(contentFilter.toLowerCase());
        const streamMatched = streamFilter === 'all'
            || (streamFilter === 'stream' && Boolean(log.is_stream))
            || (streamFilter === 'non-stream' && !log.is_stream);

        return modelMatched && contentMatched && streamMatched;
    });
    const activeLogStats = getLogStats(filteredLogs);
    const modelSummary = getModelSummary(filteredLogs);
    const mobilePagedLogs = filteredLogs.slice((mobileCurrentPage - 1) * pageSize, mobileCurrentPage * pageSize);
    const isEmptyState = !loading
        && !normalizeApiKey(apikey)
        && !activeTabData.tokenValid
        && activeTabData.logs.length === 0;
    const modelSummaryColumns = [
        {
            title: '模型',
            dataIndex: 'model_name',
            render: (text) => <Tag color={stringToColor(text)} size="large">{text}</Tag>,
        },
        {
            title: '请求数',
            dataIndex: 'request_count',
            sorter: (a, b) => a.request_count - b.request_count,
        },
        {
            title: '提示',
            dataIndex: 'prompt_tokens',
            sorter: (a, b) => a.prompt_tokens - b.prompt_tokens,
        },
        {
            title: '补全',
            dataIndex: 'completion_tokens',
            sorter: (a, b) => a.completion_tokens - b.completion_tokens,
        },
        {
            title: '总 Tokens',
            dataIndex: 'total_tokens',
            sorter: (a, b) => a.total_tokens - b.total_tokens,
        },
        {
            title: '总花费',
            dataIndex: 'total_quota',
            render: (text) => renderQuota(text, 6),
            sorter: (a, b) => a.total_quota - b.total_quota,
        },
    ];
    const tokenInfoRows = [
        { key: '令牌名称', value: activeTabData.tokenName || '未知' },
        { key: '令牌总额', value: activeTabData.unlimitedQuota ? '无限' : !activeTabData.tokenValid ? '未知' : renderQuota(activeTabData.totalGranted, 3) },
        { key: '剩余额度', value: activeTabData.unlimitedQuota ? '无限制' : !activeTabData.tokenValid ? '未知' : renderQuota(activeTabData.totalAvailable, 3) },
        { key: '已用额度', value: activeTabData.unlimitedQuota ? '不进行计算' : !activeTabData.tokenValid ? '未知' : renderQuota(activeTabData.totalUsed, 3) },
        { key: '有效期至', value: activeTabData.expiresAt === 0 ? '永不过期' : !activeTabData.tokenValid ? '未知' : renderTimestamp(activeTabData.expiresAt) },
    ];

    const renderContent = () => (
        <>
            <Card
                style={{
                    marginTop: 24,
                    overflow: 'hidden',
                    background: 'linear-gradient(180deg, rgba(250,244,232,0.95) 0%, rgba(255,255,255,0.98) 100%)',
                    border: '1px solid rgba(201,151,62,0.14)',
                }}
            >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <div>
                        <Text strong style={{ display: 'block', fontSize: isMobileView ? 20 : 24, marginBottom: 8 }}>
                            FishXCode 令牌查询
                        </Text>
                        <Text type="secondary" style={{ lineHeight: 1.7 }}>
                            输入 New API 令牌后，查看额度、调用明细、缓存读写、模型消耗汇总，并支持按条件筛选与导出。
                        </Text>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                        <Tag color="green">额度概览</Tag>
                        <Tag color="blue">模型汇总</Tag>
                        <Tag color="cyan">缓存可见</Tag>
                        <Tag color="orange">CSV 导出</Tag>
                    </div>
                    <Input
                        size="large"
                        showClear
                        value={apikey}
                        onChange={(value) => setAPIKey(normalizeApiKey(value))}
                        placeholder="请输入要查询的令牌 sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                        prefix={<IconSearch />}
                        suffix={
                            <Button
                                type='primary'
                                theme="solid"
                                onClick={() => fetchData()}
                                loading={loading}
                                disabled={normalizeApiKey(apikey) === ''}
                            >
                                查询
                            </Button>
                        }
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                fetchData();
                            }
                        }}
                    />
                    <Banner
                        type="info"
                        bordered={false}
                        closeIcon={null}
                        title="支持带参直达"
                        description="可直接通过 ?key=sk-... 自动代入查询；如配置了多站点，也可附加 ?site=server1。"
                    />
                </div>
            </Card>
            {isEmptyState ? (
                <Card
                    style={{
                        marginTop: 24,
                        background: 'linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(248,249,252,1) 100%)',
                        border: '1px solid rgba(148,163,184,0.16)',
                    }}
                >
                    <div style={{ padding: isMobileView ? '8px 4px' : '12px 8px' }}>
                        <Text strong style={{ display: 'block', fontSize: isMobileView ? 18 : 22, marginBottom: 8 }}>
                            输入令牌后可查看额度、日志、缓存命中与模型汇总
                        </Text>
                        <Text type="secondary" style={{ display: 'block', lineHeight: 1.8, marginBottom: 18 }}>
                            支持直接粘贴 `sk-...` 查询，也支持通过 `?key=` 链接自动代入。查询后会展示令牌额度、调用明细、缓存读写、模型消耗汇总与导出能力。
                        </Text>
                        <div style={{ display: 'grid', gridTemplateColumns: isMobileView ? '1fr' : 'repeat(3, minmax(0, 1fr))', gap: 12 }}>
                            <div style={{ padding: 16, borderRadius: 14, background: 'var(--semi-color-fill-0)' }}>
                                <Text strong style={{ display: 'block', marginBottom: 6 }}>额度概览</Text>
                                <Text type="secondary">查看令牌总额、剩余额度、已用额度与到期时间。</Text>
                            </div>
                            <div style={{ padding: 16, borderRadius: 14, background: 'var(--semi-color-fill-0)' }}>
                                <Text strong style={{ display: 'block', marginBottom: 6 }}>调用分析</Text>
                                <Text type="secondary">查看模型、提示/补全 tokens、总 Tokens、花费与请求摘要。</Text>
                            </div>
                            <div style={{ padding: 16, borderRadius: 14, background: 'var(--semi-color-fill-0)' }}>
                                <Text strong style={{ display: 'block', marginBottom: 6 }}>缓存可见性</Text>
                                <Text type="secondary">展示缓存读、缓存写、5m/1h 创建和对应倍率。</Text>
                            </div>
                        </div>
                    </div>
                </Card>
            ) : (
                <Card style={{ marginTop: 24 }}>
                    <Collapse activeKey={activeKeys} onChange={(keys) => setActiveKeys(keys)}>
                        {process.env.REACT_APP_SHOW_BALANCE === "true" && (
                            <Panel
                                header="令牌信息"
                                itemKey="1"
                                extra={
                                    <Button icon={<IconCopy />} theme='borderless' type='primary' onClick={(e) => copyTokenInfo(e)} disabled={!activeTabData.tokenValid}>
                                        复制令牌信息
                                    </Button>
                                }
                            >
                                <Spin spinning={loading}>
                                    <Descriptions data={tokenInfoRows} row />
                                </Spin>
                            </Panel>
                        )}
                        {process.env.REACT_APP_SHOW_DETAIL === "true" && (
                            <Panel
                                header="调用详情"
                                itemKey="2"
                                extra={
                                    <div style={{ display: 'flex', alignItems: 'center' }}>
                                        <Tag shape='circle' color='green' style={{ marginRight: 5 }}>计算汇率：$1 = 50 0000 tokens</Tag>
                                        <Button icon={<IconDownload />} theme='borderless' type='primary' onClick={(e) => exportCSV(e)} disabled={!activeTabData.tokenValid || activeTabData.logs.length === 0}>
                                            导出为CSV文件
                                        </Button>
                                    </div>
                                }
                            >
                                <Spin spinning={loading}>
                                <div style={{ marginBottom: 16, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                                    <Tag color="blue" size="large">请求数 {activeLogStats.requestCount}</Tag>
                                    <Tag color="cyan" size="large">提示 {activeLogStats.totalPromptTokens}</Tag>
                                    <Tag color="teal" size="large">补全 {activeLogStats.totalCompletionTokens}</Tag>
                                    <Tag color="green" size="large">总 Tokens {activeLogStats.totalTokens}</Tag>
                                    <Tag color="lime" size="large">缓存读 {activeLogStats.totalCacheReadTokens.toLocaleString()}</Tag>
                                    <Tag color="orange" size="large">缓存写 {activeLogStats.totalCacheWriteTokens.toLocaleString()}</Tag>
                                    <Tag color="orange" size="large">总花费 {renderQuota(activeLogStats.totalQuota, 6)}</Tag>
                                </div>
                                <div style={{ marginBottom: 16, display: 'grid', gridTemplateColumns: isMobileView ? '1fr' : 'minmax(220px, 1.2fr) minmax(220px, 1.2fr) 180px', gap: 12 }}>
                                    <Input
                                        showClear
                                        value={modelFilter}
                                        onChange={(value) => setModelFilter(value)}
                                        placeholder="按模型筛选，例如 claude-opus"
                                    />
                                    <Input
                                        showClear
                                        value={contentFilter}
                                        onChange={(value) => setContentFilter(value)}
                                        placeholder="按请求摘要筛选"
                                    />
                                    <Select value={streamFilter} onChange={(value) => setStreamFilter(value)}>
                                        <Option value="all">全部请求</Option>
                                        <Option value="stream">仅流式</Option>
                                        <Option value="non-stream">仅非流式</Option>
                                    </Select>
                                </div>
                                <div style={{ marginBottom: 16 }}>
                                    <Text strong style={{ display: 'block', marginBottom: 8 }}>模型汇总</Text>
                                    {isMobileView ? (
                                        <div className="log-mobile-summary-list">
                                            {modelSummary.map((item) => (
                                                <div key={item.key} className="log-mobile-summary-card">
                                                    <div className="log-mobile-summary-head">
                                                        <Tag color={stringToColor(item.model_name)} size="large">{item.model_name}</Tag>
                                                        <Text strong>{renderQuota(item.total_quota, 6)}</Text>
                                                    </div>
                                                    <div className="log-mobile-metrics-grid">
                                                        <div className="log-mobile-metric"><Text type="tertiary">请求数</Text><Text>{item.request_count}</Text></div>
                                                        <div className="log-mobile-metric"><Text type="tertiary">提示</Text><Text>{item.prompt_tokens}</Text></div>
                                                        <div className="log-mobile-metric"><Text type="tertiary">补全</Text><Text>{item.completion_tokens}</Text></div>
                                                        <div className="log-mobile-metric"><Text type="tertiary">总 Tokens</Text><Text>{item.total_tokens}</Text></div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <Table
                                            columns={modelSummaryColumns}
                                            dataSource={modelSummary}
                                            pagination={false}
                                            size="small"
                                            style={{ marginBottom: 12 }}
                                        />
                                    )}
                                </div>
                                {isMobileView ? (
                                    <div className="log-mobile-list">
                                        {mobilePagedLogs.map((record, index) => {
                                            const cacheSummary = getCacheSummary(record.other);
                                            return (
                                                <div key={`${record.created_at}-${index}`} className="log-mobile-card">
                                                    <div className="log-mobile-card__head">
                                                        <Text strong>{renderTimestamp(record.created_at)}</Text>
                                                        <Text strong>{renderQuota(record.quota, 6)}</Text>
                                                    </div>
                                                    <div className="log-mobile-card__tags">
                                                        <Tag color="grey">{record.token_name || '未知令牌'}</Tag>
                                                        <Tag color={stringToColor(record.model_name)}>{record.model_name}</Tag>
                                                        {renderUseTime(record.use_time)}
                                                        {renderIsStream(record.is_stream)}
                                                    </div>
                                                    <div className="log-mobile-metrics-grid">
                                                        <div className="log-mobile-metric"><Text type="tertiary">提示</Text><Text>{record.prompt_tokens}</Text></div>
                                                        <div className="log-mobile-metric"><Text type="tertiary">补全</Text><Text>{record.completion_tokens}</Text></div>
                                                        <div className="log-mobile-metric"><Text type="tertiary">总 Tokens</Text><Text>{(Number(record.prompt_tokens) || 0) + (Number(record.completion_tokens) || 0)}</Text></div>
                                                        <div className="log-mobile-metric"><Text type="tertiary">花费</Text><Text>{renderQuota(record.quota, 6)}</Text></div>
                                                    </div>
                                                    {cacheSummary ? (
                                                        <div className="log-mobile-card__section">
                                                            <Text type="tertiary">缓存</Text>
                                                            <div className="log-mobile-card__tags">
                                                                {cacheSummary.cacheReadTokens > 0 && <Tag color="lime">读 {cacheSummary.cacheReadTokens.toLocaleString()}</Tag>}
                                                                {cacheSummary.cacheWriteTokens > 0 && <Tag color="orange">写 {cacheSummary.cacheWriteTokens.toLocaleString()}</Tag>}
                                                                {cacheSummary.cacheCreationTokens5m > 0 && <Tag color="orange">5m {cacheSummary.cacheCreationTokens5m.toLocaleString()}</Tag>}
                                                                {cacheSummary.cacheCreationTokens1h > 0 && <Tag color="orange">1h {cacheSummary.cacheCreationTokens1h.toLocaleString()}</Tag>}
                                                            </div>
                                                        </div>
                                                    ) : null}
                                                    <div className="log-mobile-card__section">
                                                        <Text type="tertiary">请求摘要</Text>
                                                        <Text>{record.content || getFallbackRequestSummary(record)}</Text>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                        <Pagination
                                            currentPage={mobileCurrentPage}
                                            pageSize={pageSize}
                                            total={filteredLogs.length}
                                            onPageChange={(page) => setMobileCurrentPage(page)}
                                            onPageSizeChange={(size) => {
                                                setPageSize(size);
                                                setMobileCurrentPage(1);
                                            }}
                                            showSizeChanger
                                            pageSizeOpts={[10, 20, 50, 100]}
                                        />
                                    </div>
                                ) : (
                                    <Table
                                        columns={columns}
                                        dataSource={filteredLogs}
                                        pagination={{
                                            pageSize: pageSize,
                                            hideOnSinglePage: true,
                                            showSizeChanger: true,
                                            pageSizeOpts: [10, 20, 50, 100],
                                            onPageSizeChange: (pageSize) => setPageSize(pageSize),
                                            showTotal: (total) => `筛选后共 ${total} 条`,
                                            showQuickJumper: true,
                                            total: filteredLogs.length,
                                            style: { marginTop: 12 },
                                        }}
                                    />
                                )}
                                </Spin>
                            </Panel>
                        )}
                    </Collapse>
                </Card>
            )}
            <BackTop visibilityHeight={240} />
        </>
    );

    return (
        <>
            {Object.keys(BASE_URLS).length > 1 ? (
                <Tabs type="line" onChange={handleTabChange}>
                    {Object.entries(BASE_URLS).map(([key]) => (
                        <TabPane tab={key} itemKey={key} key={key}>
                            {renderContent()}
                        </TabPane>
                    ))}
                </Tabs>
            ) : (
                renderContent()
            )}
        </>
    );
};

export default LogsTable;
