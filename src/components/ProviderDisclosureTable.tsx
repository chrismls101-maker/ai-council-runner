import { PROVIDER_DISCLOSURE } from "../constants/providerDisclosure";

export default function ProviderDisclosureTable() {
  return (
    <div className="provider-disclosure-wrap" data-testid="provider-disclosure-table">
      <table className="provider-disclosure-table">
        <thead>
          <tr>
            <th>Provider</th>
            <th>Used for</th>
            <th>Data sent</th>
            <th>Notes</th>
          </tr>
        </thead>
        <tbody>
          {PROVIDER_DISCLOSURE.map((row) => (
            <tr key={row.provider}>
              <td>{row.provider}</td>
              <td>{row.usedFor}</td>
              <td>{row.dataSent}</td>
              <td>{row.notes}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
