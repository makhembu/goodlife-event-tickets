-- GOODLIFE Radio Phase 4: Listener Interaction, Moderation, Polls, Contests, Reminders

-- 1. Shoutouts and Song Requests
CREATE TABLE IF NOT EXISTS radio_shoutouts (
  id SERIAL PRIMARY KEY,
  slot_id INTEGER REFERENCES show_slots(id) ON DELETE SET NULL,
  sender_name VARCHAR(100) NOT NULL,
  sender_phone VARCHAR(30),
  sender_hash VARCHAR(64) NOT NULL,
  message TEXT NOT NULL,
  request_track VARCHAR(255),
  source VARCHAR(20) NOT NULL DEFAULT 'web' CHECK (source IN ('web', 'whatsapp')),
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'read', 'rejected')),
  is_featured BOOLEAN NOT NULL DEFAULT FALSE,
  moderated_by VARCHAR(100),
  moderated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_radio_shoutouts_slot ON radio_shoutouts(slot_id);
CREATE INDEX IF NOT EXISTS idx_radio_shoutouts_status ON radio_shoutouts(status);
CREATE INDEX IF NOT EXISTS idx_radio_shoutouts_featured ON radio_shoutouts(is_featured);
CREATE INDEX IF NOT EXISTS idx_radio_shoutouts_sender_hash ON radio_shoutouts(sender_hash);
CREATE INDEX IF NOT EXISTS idx_radio_shoutouts_created ON radio_shoutouts(created_at DESC);

-- 2. Interactive Polls for Live Slots
CREATE TABLE IF NOT EXISTS radio_polls (
  id SERIAL PRIMARY KEY,
  slot_id INTEGER REFERENCES show_slots(id) ON DELETE CASCADE,
  presenter_id INTEGER REFERENCES presenters(id) ON DELETE SET NULL,
  question VARCHAR(255) NOT NULL,
  poll_type VARCHAR(50) NOT NULL DEFAULT 'general' CHECK (poll_type IN ('general', 'next_track', 'vibe')),
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'closed')),
  duration_minutes INTEGER NOT NULL DEFAULT 15,
  starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ends_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_radio_polls_slot ON radio_polls(slot_id);
CREATE INDEX IF NOT EXISTS idx_radio_polls_status ON radio_polls(status);

CREATE TABLE IF NOT EXISTS radio_poll_options (
  id SERIAL PRIMARY KEY,
  poll_id INTEGER NOT NULL REFERENCES radio_polls(id) ON DELETE CASCADE,
  option_text VARCHAR(255) NOT NULL,
  vote_count INTEGER NOT NULL DEFAULT 0,
  display_order INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_radio_poll_options_poll ON radio_poll_options(poll_id);

CREATE TABLE IF NOT EXISTS radio_poll_votes (
  id SERIAL PRIMARY KEY,
  poll_id INTEGER NOT NULL REFERENCES radio_polls(id) ON DELETE CASCADE,
  option_id INTEGER NOT NULL REFERENCES radio_poll_options(id) ON DELETE CASCADE,
  voter_hash VARCHAR(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_poll_voter UNIQUE (poll_id, voter_hash)
);

CREATE INDEX IF NOT EXISTS idx_radio_poll_votes_poll ON radio_poll_votes(poll_id);

-- 3. On-Air Contests & Ticket Giveaways
CREATE TABLE IF NOT EXISTS radio_contests (
  id SERIAL PRIMARY KEY,
  slot_id INTEGER REFERENCES show_slots(id) ON DELETE SET NULL,
  presenter_id INTEGER REFERENCES presenters(id) ON DELETE SET NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  passphrase VARCHAR(100),
  contest_type VARCHAR(50) NOT NULL DEFAULT 'passphrase' CHECK (contest_type IN ('passphrase', 'random_draw', 'trivia')),
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'closed')),
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE RESTRICT,
  tier_id VARCHAR(50) NOT NULL,
  max_winners INTEGER NOT NULL DEFAULT 1,
  winners_awarded INTEGER NOT NULL DEFAULT 0,
  starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ends_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_contest_winners_cap CHECK (winners_awarded <= max_winners)
);

CREATE INDEX IF NOT EXISTS idx_radio_contests_slot ON radio_contests(slot_id);
CREATE INDEX IF NOT EXISTS idx_radio_contests_status ON radio_contests(status);

CREATE TABLE IF NOT EXISTS radio_contest_entries (
  id SERIAL PRIMARY KEY,
  contest_id INTEGER NOT NULL REFERENCES radio_contests(id) ON DELETE CASCADE,
  listener_name VARCHAR(100) NOT NULL,
  listener_phone VARCHAR(30) NOT NULL,
  participant_hash VARCHAR(64) NOT NULL,
  answer_text TEXT,
  is_winner BOOLEAN NOT NULL DEFAULT FALSE,
  awarded_ticket_id VARCHAR(50) REFERENCES tickets(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_contest_participant UNIQUE (contest_id, participant_hash)
);

CREATE INDEX IF NOT EXISTS idx_contest_entries_contest ON radio_contest_entries(contest_id);

-- 4. Show Reminders & Opt-Ins
CREATE TABLE IF NOT EXISTS radio_reminders (
  id SERIAL PRIMARY KEY,
  phone VARCHAR(30) NOT NULL,
  phone_hash VARCHAR(64) NOT NULL,
  show_id INTEGER NOT NULL REFERENCES shows(id) ON DELETE CASCADE,
  unsubscribe_token VARCHAR(64) NOT NULL UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_phone_show_reminder UNIQUE (phone_hash, show_id)
);

CREATE INDEX IF NOT EXISTS idx_radio_reminders_show ON radio_reminders(show_id);
CREATE INDEX IF NOT EXISTS idx_radio_reminders_phone ON radio_reminders(phone_hash);

-- 5. Broadcast Reminders & Presenter Ping Logs
CREATE TABLE IF NOT EXISTS radio_messaging_log (
  id SERIAL PRIMARY KEY,
  recipient_phone_hash VARCHAR(64) NOT NULL,
  recipient_role VARCHAR(20) NOT NULL CHECK (recipient_role IN ('presenter', 'listener', 'operator')),
  channel VARCHAR(20) NOT NULL DEFAULT 'waha' CHECK (channel IN ('waha', 'cloud_api', 'dry_run')),
  message_type VARCHAR(50) NOT NULL CHECK (message_type IN ('show_reminder', 'presenter_standby_ping', 'shoutout_ack', 'contest_win')),
  content_preview VARCHAR(120),
  status VARCHAR(20) NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'failed', 'dry_run_logged', 'opted_out')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_radio_msg_log_created ON radio_messaging_log(created_at DESC);
