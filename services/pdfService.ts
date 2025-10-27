import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { Item, AnalyticsData } from '../types';
import { getLogoDataUrl } from './logoService';

const PRIMARY_COLOR = '#2563eb';

const addHeaderAndFooter = (doc: jsPDF, title: string, orgName: string, logoDataUrl: string | null) => {
    const pageCount = (doc as any).internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        // Header
        if (logoDataUrl) {
            try {
                doc.addImage(logoDataUrl, 'PNG', 15, 12, 20, 20);
            } catch (error) {
                console.error('Error al añadir la imagen del logo:', error);
            }
        }
        doc.setFontSize(18);
        doc.setTextColor(PRIMARY_COLOR);
        doc.text(orgName, 38, 22);
        doc.setFontSize(14);
        doc.setTextColor(100);
        doc.text(title, 15, 40);
        doc.setDrawColor(PRIMARY_COLOR);
        doc.line(15, 45, doc.internal.pageSize.width - 15, 45);

        // Footer
        const pageStr = `Página ${i} de ${pageCount}`;
        const dateStr = new Date().toLocaleDateString('es-ES');
        doc.setFontSize(8);
        doc.setTextColor(150);
        doc.text(pageStr, 15, doc.internal.pageSize.height - 10);
        doc.text(dateStr, doc.internal.pageSize.width - 15, doc.internal.pageSize.height - 10, { align: 'right' });
    }
};

export const generateAnalyticsReport = async (data: AnalyticsData, orgName: string) => {
    const doc = new jsPDF();
    const logoDataUrl = await getLogoDataUrl();
    let yPos = 55;

    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Resumen Ejecutivo', 15, yPos);
    yPos += 7;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(40);
    const summaryLines = doc.splitTextToSize(data.executiveSummary, 180);
    doc.text(summaryLines, 15, yPos);
    yPos += summaryLines.length * 5 + 5;


    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Indicadores Clave (KPIs)', 15, yPos);
    yPos += 7;
    (doc as any).autoTable({
        startY: yPos,
        body: [
            ['Unidades Totales', `${data.totalStock} unidades`, `${data.kpiTrends.totalStock.change > 0 ? '+' : ''}${data.kpiTrends.totalStock.change}%`],
            ['Valor Estimado de Stock', `$${data.totalValue.toFixed(0)}`, `${data.kpiTrends.stockValue.change > 0 ? '+' : ''}${data.kpiTrends.stockValue.change}%`],
            ['Días de Inventario en Mano', `${data.daysOnHand.toFixed(0)} días`, `${data.kpiTrends.daysOnHand.change > 0 ? '+' : ''}${data.kpiTrends.daysOnHand.change}%`],
            ['Proyección de Uso (30 días)', `${data.demandForecast.total} unidades`, '']
        ],
        theme: 'grid',
        headStyles: { fillColor: [37, 99, 235] },
    });
    yPos = (doc as any).autoTable.previous.finalY + 15;

    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Sugerencias de Optimización Logística', 15, yPos);
    yPos += 7;
    (doc as any).autoTable({
        startY: yPos,
        head: [['Artículo a Mover', 'Razón de la Sugerencia', 'Rotación (30d)']],
        body: data.logisticsSuggestions.map(item => [item.itemName, item.reason, `${item.rotation} unidades`]),
        theme: 'striped',
        headStyles: { fillColor: [249, 115, 22] }, // Orange color for suggestions
    });
    yPos = (doc as any).autoTable.previous.finalY + 15;

    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Alertas: Ítems con Bajo Stock', 15, yPos);
    yPos += 7;
    (doc as any).autoTable({
        startY: yPos,
        head: [['Material', 'Stock Actual', 'Punto de Reorden']],
        body: data.reorderPoints.map(item => [item.name, item.currentStock, item.reorderPoint]),
        theme: 'striped',
        headStyles: { fillColor: [239, 68, 68] },
    });
    yPos = (doc as any).autoTable.previous.finalY + 15;

    addHeaderAndFooter(doc, 'Informe de Métricas y Análisis', orgName, logoDataUrl);
    doc.save(`Informe_Metricas_${orgName}_${new Date().toISOString().split('T')[0]}.pdf`);
};

export const generateInventoryReport = async (selectedItems: (Item & { stock: number })[], orgName: string) => {
    const doc = new jsPDF();
    const logoDataUrl = await getLogoDataUrl();

    const tableData = selectedItems.map(item => [
        item.name,
        item.type,
        item.stock.toString()
    ]);

    (doc as any).autoTable({
        startY: 55,
        head: [['Nombre del Artículo', 'Tipo', 'Stock Actual']],
        body: tableData,
        theme: 'grid',
        headStyles: { fillColor: PRIMARY_COLOR }
    });

    addHeaderAndFooter(doc, 'Informe de Inventario Personalizado', orgName, logoDataUrl);
    doc.save(`Inventario_${orgName}_${new Date().toISOString().split('T')[0]}.pdf`);
};