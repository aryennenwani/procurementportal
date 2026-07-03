import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FileCheck2, Download, RefreshCw, PlugZap, AlertTriangle } from 'lucide-react';
import api, { apiErrorMessage } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { Card, PageLoader, Button, EmptyState, PageHeader } from '../../components/Common';
import { SapStatusBadge } from '../../components/Badges';

export default function PurchaseOrders() {
  const [orders, setOrders] = useState([]);
  const [sapConfigured, setSapConfigured] = useState(true);
  const [loading, setLoading] = useState(true);
  const [retryingId, setRetryingId] = useState(null);
  const toast = useToast();

  const load = async () => {
    try {
      const { data } = await api.get('/purchase-orders');
      setOrders(data.purchase_orders);
      setSapConfigured(data.sap_configured);
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Could not load purchase orders.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const downloadPdf = async (po) => {
    try {
      const res = await api.get(`/purchase-orders/${po.id}/pdf`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `${po.po_number}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Could not download the PO document.'));
    }
  };

  const retrySync = async (po) => {
    setRetryingId(po.id);
    try {
      const { data } = await api.post(`/purchase-orders/${po.id}/retry`);
      setOrders((prev) => prev.map((o) => (o.id === po.id ? data.purchase_order : o)));
      if (data.purchase_order.sap_status === 'synced') {
        toast.success(`${po.po_number} synced to SAP as ${data.purchase_order.sap_po_number}.`);
      } else {
        toast.error(data.purchase_order.sap_error || 'SAP sync failed again.');
      }
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Could not retry the SAP sync.'));
    } finally {
      setRetryingId(null);
    }
  };

  if (loading) return <PageLoader />;

  const totalValue = orders.reduce((sum, o) => sum + o.total_amount, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Purchase Orders"
        subtitle="Raised automatically when a winning bid is selected, and pushed to SAP."
      />

      {!sapConfigured && (
        <div className="card-surface px-5 py-4 flex items-start gap-3 !border-blue-200 bg-blue-50/60">
          <PlugZap size={18} className="text-[#1A56D6] shrink-0 mt-0.5" />
          <p className="text-sm text-[#1E2B4A]">
            <strong>SAP is not connected.</strong> Purchase orders are being raised in the portal only.
            Set <code className="text-xs bg-white border border-blue-200 rounded px-1.5 py-0.5">SAP_BASE_URL</code>,{' '}
            <code className="text-xs bg-white border border-blue-200 rounded px-1.5 py-0.5">SAP_USERNAME</code> and{' '}
            <code className="text-xs bg-white border border-blue-200 rounded px-1.5 py-0.5">SAP_PASSWORD</code> to enable automatic PO creation in SAP.
          </p>
        </div>
      )}

      {orders.length === 0 ? (
        <Card>
          <EmptyState
            icon={<FileCheck2 size={28} className="text-[#7EA6FF]" />}
            title="No purchase orders yet"
            subtitle="When a winning quotation is selected on a requirement, its purchase order will appear here automatically."
          />
        </Card>
      ) : (
        <>
          <p className="text-sm text-[#64748F]">
            {orders.length} purchase order{orders.length !== 1 ? 's' : ''} • total value{' '}
            <strong className="text-[#101C3B]">₹{totalValue.toLocaleString('en-IN')}</strong>
          </p>
          <div className="table-shell overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-gray-500 text-xs uppercase tracking-wide">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold">PO Number</th>
                  <th className="text-left px-4 py-3 font-semibold">Item</th>
                  <th className="text-left px-4 py-3 font-semibold">Vendor</th>
                  <th className="text-right px-4 py-3 font-semibold">Amount</th>
                  <th className="text-left px-4 py-3 font-semibold">ERP Status</th>
                  <th className="text-left px-4 py-3 font-semibold">Raised</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {orders.map((po) => (
                  <tr key={po.id}>
                    <td className="px-4 py-3.5">
                      <p className="font-semibold text-[#101C3B]">{po.po_number}</p>
                      {po.sap_po_number && <p className="text-xs text-[#8A97B5] mt-0.5">SAP: {po.sap_po_number}</p>}
                    </td>
                    <td className="px-4 py-3.5">
                      <Link to={`/dashboard/requirements/${po.requirement_id}`} className="font-medium text-[#1E2B4A] hover:text-[#1A56D6] hover:underline">
                        {po.requirement_title}
                      </Link>
                      <p className="text-xs text-[#8A97B5] mt-0.5">{po.quantity} {po.unit}</p>
                    </td>
                    <td className="px-4 py-3.5">
                      <p className="text-[#1E2B4A] font-medium">{po.vendor_name}</p>
                      <p className="text-xs text-[#8A97B5] mt-0.5">{po.vendor_contact}</p>
                    </td>
                    <td className="px-4 py-3.5 text-right font-semibold text-[#101C3B] whitespace-nowrap">
                      ₹{po.total_amount.toLocaleString('en-IN')}
                    </td>
                    <td className="px-4 py-3.5">
                      <SapStatusBadge status={po.sap_status} />
                      {po.sap_status === 'failed' && po.sap_error && (
                        <p className="text-xs text-red-500 mt-1 max-w-[220px] flex items-start gap-1">
                          <AlertTriangle size={12} className="shrink-0 mt-0.5" /> {po.sap_error}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-[#64748F] whitespace-nowrap">
                      {po.created_at_ist}
                      <p className="text-xs text-[#8A97B5] mt-0.5">by {po.created_by_name}</p>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center justify-end gap-2">
                        {(po.sap_status === 'failed' || (po.sap_status === 'local' && sapConfigured)) && (
                          <Button
                            variant="outline"
                            className="!py-1.5 !px-3 text-xs"
                            disabled={retryingId === po.id}
                            onClick={() => retrySync(po)}
                          >
                            <RefreshCw size={13} className={retryingId === po.id ? 'animate-spin' : ''} />
                            {retryingId === po.id ? 'Syncing…' : 'Retry SAP'}
                          </Button>
                        )}
                        <Button variant="outline" className="!py-1.5 !px-3 text-xs" onClick={() => downloadPdf(po)}>
                          <Download size={13} /> PDF
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
