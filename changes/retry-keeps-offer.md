### Fixed

- Retrying a failed Approve or Deny sends the offer's id again, so a retry
  after the offer closed is refused instead of answering a newer offer.
  Needs server#241's `confirmation_id` on dispatches.
