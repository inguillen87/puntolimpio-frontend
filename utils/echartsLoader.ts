import type { ECharts } from 'echarts';

let loader: Promise<typeof import('echarts')> | null = null;

export const loadEcharts = () => {
  if (!loader) {
    loader = import('echarts');
  }
  return loader;
};

export type { ECharts };
