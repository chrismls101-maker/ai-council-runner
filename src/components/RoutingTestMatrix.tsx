import { ROUTING_TEST_MATRIX, type RoutingTestCase } from "../constants/routingTestMatrix";

interface RoutingTestMatrixProps {
  onRunTest: (test: RoutingTestCase) => void;
}

export default function RoutingTestMatrix({ onRunTest }: RoutingTestMatrixProps) {
  return (
    <div className="routing-test-matrix">
      <p className="muted routing-test-intro">
        Developer checklist — run each prompt with Auto Router and confirm the route matches.
      </p>
      <ul className="routing-test-list">
        {ROUTING_TEST_MATRIX.map((test) => (
          <li key={test.id} className="routing-test-item">
            <div className="routing-test-item-header">
              <span className="routing-test-id">{test.id}</span>
              <span className="routing-test-expected">
                Expected: <strong>{test.expectedRoute}</strong>
              </span>
            </div>
            <p className="routing-test-prompt">{test.prompt}</p>
            {test.notes && <p className="routing-test-notes muted">{test.notes}</p>}
            <button
              type="button"
              className="btn ghost small"
              onClick={() => onRunTest(test)}
            >
              Run with Auto Router
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
