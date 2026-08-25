function processChartExport(processExport, chartKey, exportedAt = new Date().toISOString()) {
  if (!processExport || typeof processExport !== 'object') {
    throw new TypeError('Process-exporten saknas');
  }
  if (!Array.isArray(processExport.charts)) {
    throw new TypeError('Process-exporten saknar charts');
  }
  const chart = processExport.charts.find(candidate => candidate?.metadata?.chartKey === chartKey);
  if (!chart) throw new RangeError(`Okänt processdiagram: ${chartKey}`);
  if (!chart.chartData || !Array.isArray(chart.chartData.nodes) || !Array.isArray(chart.chartData.edges)) {
    throw new TypeError(`Processdiagrammet ${chartKey} har ogiltig chartData`);
  }

  const exportedChart = {
    name: chart.name,
    type: chart.type,
    description: chart.description,
    chartData: {
      nodes: chart.chartData.nodes.map(node => ({
        id: node.id,
        type: node.type,
        position: { ...node.position },
        data: { ...node.data },
      })),
      edges: chart.chartData.edges.map(edge => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        sourceHandle: edge.sourceHandle || 'source-right',
        targetHandle: edge.targetHandle || 'target-left',
        type: !edge.type || edge.type === 'default' ? 'step' : edge.type,
        ...(edge.data ? { data: { ...edge.data } } : {}),
      })),
    },
    metadata: { ...chart.metadata },
  };

  return {
    version: String(processExport.version || '1.0'),
    exportedAt: String(exportedAt),
    charts: [exportedChart],
  };
}

function serializeProcessChartExport(processExport, chartKey, exportedAt) {
  return `${JSON.stringify(processChartExport(processExport, chartKey, exportedAt), null, 2)}\n`;
}

export { processChartExport, serializeProcessChartExport };
