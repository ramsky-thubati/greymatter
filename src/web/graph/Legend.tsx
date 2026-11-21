import { FlagIcon, PadlockIcon } from '../ui/icons.js'
import { STATE_LABEL, STATES, StatusDot } from '../ui/StatusDot.js'

export function Legend() {
  return (
    <div className="legend">
      {STATES.map((s) => (
        <span key={s}>
          <StatusDot state={s} />
          {STATE_LABEL[s]}
        </span>
      ))}
      <i className="sep" />
      <span>
        <i className="pbox" />
        Being worked on
      </span>
      <span>
        <i className="ico">
          <PadlockIcon />
        </i>
        Blocked
      </span>
      <span>
        <i className="ico">
          <FlagIcon />
        </i>
        Blocks another task
      </span>
    </div>
  )
}
