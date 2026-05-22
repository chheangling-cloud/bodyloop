/**
 * ExcelExporter - 简洁的导出工具
 *
 * 用法:
 *   ExcelExporter.export({
 *     filename: '订单列表',
 *     sheets: [{
 *       name: '订单列表',
 *       columns: [
 *         { key: 'no',       label: '订单号',  width: 16 },
 *         { key: 'customer', label: '客户名' },
 *         { key: 'amount',   label: '金额',    format: 'currency' },
 *         { key: 'date',     label: '日期',    format: 'date' },
 *       ],
 *       rows: [
 *         { no: 'SO-001', customer: 'A 公司', amount: 1500000, date: '2026-05-19' },
 *         ...
 *       ]
 *     }]
 *   });
 *
 * 实现:输出 SpreadsheetML 2003(.xls 兼容)— Excel/WPS/Numbers 都能打开
 * 这种格式无需 SheetJS 库,纯前端,零依赖,中文友好,带类型(数字/日期/货币)
 */

const ExcelExporter = (function () {
  'use strict';

  // 转义 XML
  function esc(v) {
    if (v == null) return '';
    return String(v)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  function _formatValue(val, format) {
    if (val == null || val === '') return { type: 'String', value: '' };
    if (format === 'currency' || format === 'money') {
      // 输入是 cents 整数;转成元
      const num = typeof val === 'number' ? val / 100 : Number(String(val).replace(/[^\d.-]/g, ''));
      if (isNaN(num)) return { type: 'String', value: String(val) };
      return { type: 'Number', value: num.toFixed(2) };
    }
    if (format === 'number') {
      const num = Number(val);
      if (isNaN(num)) return { type: 'String', value: String(val) };
      return { type: 'Number', value: num };
    }
    if (format === 'date') {
      // 输入支持 ISO 字符串
      let dt = val;
      if (typeof val === 'string' && val.length >= 10) dt = val.slice(0, 10);
      return { type: 'String', value: dt };  // 用字符串避免 Excel 格式问题
    }
    if (format === 'datetime') {
      if (typeof val === 'string' && val.length >= 16) return { type: 'String', value: val.replace('T', ' ').slice(0, 16) };
      return { type: 'String', value: String(val) };
    }
    return { type: 'String', value: String(val) };
  }

  function _sheetXml(sheet) {
    const cols = sheet.columns || [];
    const rows = sheet.rows || [];

    // <Column> 定义宽度
    const colsXml = cols.map(c => {
      const w = (c.width || 12) * 7;  // 7 像素每字符
      return `<Column ss:Width="${w}"/>`;
    }).join('');

    // 表头
    const headerXml = `
      <Row ss:StyleID="header">
        ${cols.map(c => `<Cell ss:StyleID="header"><Data ss:Type="String">${esc(c.label || c.key)}</Data></Cell>`).join('')}
      </Row>
    `;

    // 数据行
    const rowsXml = rows.map(r => {
      const cells = cols.map(c => {
        let raw = r[c.key];
        if (typeof c.render === 'function') raw = c.render(r);
        const { type, value } = _formatValue(raw, c.format);
        const styleId = c.format === 'currency' || c.format === 'money' ? 'currency'
                      : (c.format === 'number') ? 'number'
                      : '';
        const styleAttr = styleId ? ` ss:StyleID="${styleId}"` : '';
        return `<Cell${styleAttr}><Data ss:Type="${type}">${esc(value)}</Data></Cell>`;
      }).join('');
      return `<Row>${cells}</Row>`;
    }).join('');

    return `
      <Worksheet ss:Name="${esc(sheet.name || 'Sheet1')}">
        <Table>
          ${colsXml}
          ${headerXml}
          ${rowsXml}
        </Table>
      </Worksheet>
    `;
  }

  function _buildXml(sheets) {
    const sheetXml = sheets.map(_sheetXml).join('');
    return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
  <Styles>
    <Style ss:ID="Default" ss:Name="Normal">
      <Font ss:FontName="Microsoft YaHei" ss:Size="11"/>
      <Alignment ss:Vertical="Center"/>
    </Style>
    <Style ss:ID="header">
      <Font ss:FontName="Microsoft YaHei" ss:Size="11" ss:Bold="1" ss:Color="#FFFFFF"/>
      <Interior ss:Color="#2563EB" ss:Pattern="Solid"/>
      <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
      <Borders>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#1E40AF"/>
      </Borders>
    </Style>
    <Style ss:ID="currency">
      <NumberFormat ss:Format="#,##0.00"/>
      <Alignment ss:Horizontal="Right"/>
    </Style>
    <Style ss:ID="number">
      <NumberFormat ss:Format="#,##0"/>
      <Alignment ss:Horizontal="Right"/>
    </Style>
  </Styles>
  ${sheetXml}
</Workbook>`;
  }

  function _download(filename, content) {
    const BOM = '\uFEFF';
    const blob = new Blob([BOM + content], { type: 'application/vnd.ms-excel;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename + '.xls';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
  }

  /**
   * 主导出 API
   * @param {object} opts
   * @param {string} opts.filename - 不含扩展名
   * @param {array}  opts.sheets   - 见上注释
   */
  function exportData(opts) {
    const filename = opts.filename || '导出';
    const sheets = opts.sheets || [];
    if (sheets.length === 0) {
      if (typeof Toast !== 'undefined') Toast.warning('无数据可导出');
      return;
    }
    const xml = _buildXml(sheets);
    _download(filename, xml);
    if (typeof Toast !== 'undefined') Toast.success(`已导出 ${filename}.xls`);
  }

  /**
   * 单 sheet 快捷方式
   */
  function exportSheet(filename, sheetName, columns, rows) {
    exportData({ filename, sheets: [{ name: sheetName, columns, rows }] });
  }

  return { export: exportData, exportSheet };
})();

window.ExcelExporter = ExcelExporter;
