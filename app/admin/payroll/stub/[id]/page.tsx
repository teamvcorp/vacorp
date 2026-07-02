import { getPaycheck, getEmployee } from "@/lib/payroll";
import { stubHtml } from "@/lib/payrollHtml";
import PrintOnLoad from "../../../PrintOnLoad";

export const metadata = {
  title: "Paycheck stub",
  robots: { index: false, follow: false },
};

export default async function StubPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const paycheck = await getPaycheck(id);
  const employee = paycheck ? await getEmployee(paycheck.employeeId) : null;

  if (!paycheck) {
    return (
      <div style={{ padding: 40, fontFamily: "system-ui, sans-serif" }}>
        Paycheck not found.
      </div>
    );
  }

  return (
    <div style={{ background: "#fff", minHeight: "100vh", padding: "32px 16px" }}>
      <PrintOnLoad />
      <div dangerouslySetInnerHTML={{ __html: stubHtml(paycheck, employee) }} />
    </div>
  );
}
