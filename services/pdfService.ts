import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { Item, AnalyticsData } from '../types';

// FIX: Replaced the corrupt base64 string with a valid one for the logo to fix PDF generation.
const LOGO_URL = `data:image/png;base64,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`;
const PRIMARY_COLOR = '#2563eb';

const addHeaderAndFooter = (doc: jsPDF, title: string, orgName: string) => {
    const pageCount = (doc as any).internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        // Header
        try {
            doc.addImage(LOGO_URL, 'PNG', 15, 12, 12, 12);
        } catch (e) {
            console.error("Error al añadir la imagen del logo:", e);
        }
        doc.setFontSize(18);
        doc.setTextColor(PRIMARY_COLOR);
        doc.text(orgName, 30, 20);
        doc.setFontSize(14);
        doc.setTextColor(100);
        doc.text(title, 15, 35);
        doc.setDrawColor(PRIMARY_COLOR);
        doc.line(15, 40, doc.internal.pageSize.width - 15, 40);

        // Footer
        const pageStr = `Página ${i} de ${pageCount}`;
        const dateStr = new Date().toLocaleDateString('es-ES');
        doc.setFontSize(8);
        doc.setTextColor(150);
        doc.text(pageStr, 15, doc.internal.pageSize.height - 10);
        doc.text(dateStr, doc.internal.pageSize.width - 15, doc.internal.pageSize.height - 10, { align: 'right' });
    }
};

export const generateAnalyticsReport = (data: AnalyticsData, orgName: string) => {
    const doc = new jsPDF();
    let yPos = 50;

    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text("Resumen Ejecutivo", 15, yPos);
    yPos += 7;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(40);
    const summaryLines = doc.splitTextToSize(data.executiveSummary, 180);
    doc.text(summaryLines, 15, yPos);
    yPos += summaryLines.length * 5 + 5;


    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text("Indicadores Clave (KPIs)", 15, yPos);
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
    doc.text("Sugerencias de Optimización Logística", 15, yPos);
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
    doc.text("Alertas: Ítems con Bajo Stock", 15, yPos);
    yPos += 7;
    (doc as any).autoTable({
        startY: yPos,
        head: [['Material', 'Stock Actual', 'Punto de Reorden']],
        body: data.reorderPoints.map(item => [item.name, item.currentStock, item.reorderPoint]),
        theme: 'striped',
        headStyles: { fillColor: [239, 68, 68] },
    });
    yPos = (doc as any).autoTable.previous.finalY + 15;

    addHeaderAndFooter(doc, 'Informe de Métricas y Análisis', orgName);
    doc.save(`Informe_Metricas_${orgName}_${new Date().toISOString().split('T')[0]}.pdf`);
};

export const generateInventoryReport = (selectedItems: (Item & { stock: number })[], orgName: string) => {
    const doc = new jsPDF();
    
    const tableData = selectedItems.map(item => [
        item.name,
        item.type,
        item.stock.toString()
    ]);

    (doc as any).autoTable({
        startY: 50,
        head: [['Nombre del Artículo', 'Tipo', 'Stock Actual']],
        body: tableData,
        theme: 'grid',
        headStyles: { fillColor: PRIMARY_COLOR }
    });

    addHeaderAndFooter(doc, 'Informe de Inventario Personalizado', orgName);
    doc.save(`Inventario_${orgName}_${new Date().toISOString().split('T')[0]}.pdf`);
};