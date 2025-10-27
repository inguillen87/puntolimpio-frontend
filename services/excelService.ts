import { AnalyticsData } from '../types';
import { getLogoDataUrl } from './logoService';

export interface WarehouseLogExportRow {
    createdAt: Date;
    type: 'Ingreso' | 'Egreso';
    itemName: string;
    quantity: number;
    partner: string;
    location: string;
    documentName: string;
    documentUrl: string;
}

const escapeHtml = (value: string): string =>
    value.replace(/&/g, '&amp;')
         .replace(/</g, '&lt;')
         .replace(/>/g, '&gt;')
         .replace(/"/g, '&quot;')
         .replace(/'/g, '&#39;');

const escapeHtmlAttribute = (value: string): string =>
    value
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

const buildLogoHtml = (logoDataUrl: string | null): string =>
    logoDataUrl ? `<img src="${logoDataUrl}" alt="Punto Limpio" style="height:70px;margin-bottom:12px;" />` : '';

const downloadExcelFile = (html: string, fileName: string) => {
    const blob = new Blob(['\ufeff' + html], { type: 'application/vnd.ms-excel' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
};

export const exportAnalyticsExcel = async (data: AnalyticsData, orgName: string) => {
    const logoDataUrl = await getLogoDataUrl();
    const dateLabel = new Date().toLocaleString('es-ES');

    const kpiRows = [
        ['Unidades Totales', `${data.totalStock} unidades`, `${data.kpiTrends.totalStock.change > 0 ? '+' : ''}${data.kpiTrends.totalStock.change}%`],
        ['Valor Estimado de Stock', `$${data.totalValue.toFixed(0)}`, `${data.kpiTrends.stockValue.change > 0 ? '+' : ''}${data.kpiTrends.stockValue.change}%`],
        ['Días de Inventario en Mano', `${data.daysOnHand.toFixed(0)} días`, `${data.kpiTrends.daysOnHand.change > 0 ? '+' : ''}${data.kpiTrends.daysOnHand.change}%`],
        ['Proyección de Uso (30 días)', `${data.demandForecast.total} unidades`, ''],
    ].map(row => `<tr>${row.map(value => `<td>${escapeHtml(value)}</td>`).join('')}</tr>`).join('');

    const logisticsRows = data.logisticsSuggestions.length > 0
        ? data.logisticsSuggestions.map(item => `
            <tr>
                <td>${escapeHtml(item.itemName)}</td>
                <td>${escapeHtml(item.reason)}</td>
                <td style="text-align:center;">${item.rotation} unidades</td>
            </tr>
        `).join('')
        : '<tr><td colspan="3" style="text-align:center;">Sin sugerencias registradas.</td></tr>';

    const reorderRows = data.reorderPoints.length > 0
        ? data.reorderPoints.map(item => `
            <tr>
                <td>${escapeHtml(item.name)}</td>
                <td style="text-align:center;">${item.currentStock}</td>
                <td style="text-align:center;">${item.reorderPoint}</td>
            </tr>
        `).join('')
        : '<tr><td colspan="3" style="text-align:center;">Sin alertas de stock bajo.</td></tr>';

    const html = `
        <html>
            <head>
                <meta charset="UTF-8" />
                <style>
                    body { font-family: Arial, sans-serif; color: #111827; }
                    h1 { color: #2563eb; margin-bottom: 4px; }
                    h2 { margin-top: 24px; color: #111827; }
                    table { border-collapse: collapse; width: 100%; margin-top: 12px; }
                    th { background-color: #2563eb; color: #ffffff; padding: 8px; text-align: left; }
                    td { border: 1px solid #e5e7eb; padding: 8px; }
                    .section-subtitle { color: #6b7280; font-size: 14px; margin-top: 0; }
                    .tag { display: inline-block; background-color: #eff6ff; color: #2563eb; padding: 2px 8px; border-radius: 9999px; font-size: 12px; }
                </style>
            </head>
            <body>
                ${buildLogoHtml(logoDataUrl)}
                <h1>${escapeHtml(orgName)}</h1>
                <p class="section-subtitle">Informe generado el ${escapeHtml(dateLabel)}</p>

                <h2>Resumen Ejecutivo</h2>
                <p>${escapeHtml(data.executiveSummary).replace(/\n/g, '<br/>')}</p>

                <h2>Indicadores Clave (KPIs)</h2>
                <table>
                    <thead>
                        <tr>
                            <th>Indicador</th>
                            <th>Valor</th>
                            <th>Variación</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${kpiRows}
                    </tbody>
                </table>

                <h2>Sugerencias de Optimización Logística</h2>
                <table>
                    <thead>
                        <tr>
                            <th>Artículo</th>
                            <th>Razón</th>
                            <th>Rotación (30d)</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${logisticsRows}
                    </tbody>
                </table>

                <h2>Alertas: Ítems con Bajo Stock</h2>
                <table>
                    <thead>
                        <tr>
                            <th>Material</th>
                            <th>Stock Actual</th>
                            <th>Punto de Reorden</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${reorderRows}
                    </tbody>
                </table>
            </body>
        </html>
    `;

    const fileName = `Informe_Metricas_${orgName}_${new Date().toISOString().split('T')[0]}.xls`;
    downloadExcelFile(html, fileName);
};

export const exportWarehouseLogExcel = async (rows: WarehouseLogExportRow[], orgName: string) => {
    const logoDataUrl = await getLogoDataUrl();
    const dateLabel = new Date().toLocaleString('es-ES');

    const tableRows = rows.length > 0
        ? rows.map(row => `
            <tr>
                <td>${escapeHtml(row.createdAt.toLocaleString('es-ES'))}</td>
                <td>${escapeHtml(row.type)}</td>
                <td>${escapeHtml(row.itemName)}</td>
                <td style="text-align:center;">${row.quantity}</td>
                <td>${escapeHtml(row.partner)}</td>
                <td>${escapeHtml(row.location)}</td>
                <td>${escapeHtml(row.documentName)}</td>
                <td>${row.documentUrl ? `<a href="${escapeHtmlAttribute(row.documentUrl)}" style="color:#2563eb;text-decoration:underline;" target="_blank" rel="noopener noreferrer">${escapeHtml(row.documentUrl)}</a>` : ''}</td>
            </tr>
        `).join('')
        : '<tr><td colspan="8" style="text-align:center;">No hay movimientos registrados en el periodo seleccionado.</td></tr>';

    const html = `
        <html>
            <head>
                <meta charset="UTF-8" />
                <style>
                    body { font-family: Arial, sans-serif; color: #111827; }
                    h1 { color: #2563eb; margin-bottom: 4px; }
                    h2 { margin-top: 24px; color: #111827; }
                    table { border-collapse: collapse; width: 100%; margin-top: 12px; }
                    th { background-color: #2563eb; color: #ffffff; padding: 8px; text-align: left; }
                    td { border: 1px solid #e5e7eb; padding: 8px; }
                    .section-subtitle { color: #6b7280; font-size: 14px; margin-top: 0; }
                </style>
            </head>
            <body>
                ${buildLogoHtml(logoDataUrl)}
                <h1>${escapeHtml(orgName)}</h1>
                <p class="section-subtitle">Registro de Movimientos de Almacén · Generado el ${escapeHtml(dateLabel)}</p>

                <table>
                    <thead>
                        <tr>
                            <th>Fecha</th>
                            <th>Tipo</th>
                            <th>Artículo</th>
                            <th>Cantidad</th>
                            <th>Socio Logístico</th>
                            <th>Ubicación</th>
                            <th>Documento</th>
                            <th>URL Documento</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${tableRows}
                    </tbody>
                </table>
            </body>
        </html>
    `;

    const fileName = `Movimientos_Almacen_${orgName}_${new Date().toISOString().split('T')[0]}.xls`;
    downloadExcelFile(html, fileName);
};
