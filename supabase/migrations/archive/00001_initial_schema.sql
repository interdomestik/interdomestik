-- Interdomestik V2 Database Schema
-- Initial migration for core tables

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ===========================================
-- ENUMS
-- ===========================================

CREATE TYPE user_role AS ENUM ('user', 'agent', 'staff', 'admin');
CREATE TYPE subscription_plan AS ENUM ('basic', 'standard', 'premium', 'family');
CREATE TYPE subscription_status AS ENUM ('active', 'canceled', 'past_due', 'expired', 'trialing');
CREATE TYPE claim_category AS ENUM ('consumer', 'housing', 'insurance', 'employment', 'contracts', 'utilities');
CREATE TYPE claim_status AS ENUM ('draft', 'submitted', 'assigned', 'investigating', 'contacting', 'negotiating', 'mediation', 'resolved', 'closed');
CREATE TYPE claim_priority AS ENUM ('low', 'normal', 'high', 'urgent');
CREATE TYPE resolution_type AS ENUM ('won', 'partial', 'lost', 'settled', 'withdrawn');
CREATE TYPE document_category AS ENUM ('evidence', 'correspondence', 'contract', 'receipt', 'other');

-- ===========================================
-- USERS TABLE
-- ===========================================

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT,
  phone TEXT,
  avatar_url TEXT,
  role user_role DEFAULT 'user' NOT NULL,
  locale TEXT DEFAULT 'sq' NOT NULL,
  onboarding_completed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Enable RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Users can read their own profile
CREATE POLICY "Users can read own profile" ON users
  FOR SELECT USING (auth.uid() = id);

-- Users can update their own profile
CREATE POLICY "Users can update own profile" ON users
  FOR UPDATE USING (auth.uid() = id);

-- Agents and admins can view all users
CREATE POLICY "Staff can view all users" ON users
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('agent', 'staff', 'admin')
    )
  );

-- ===========================================
-- SUBSCRIPTIONS TABLE
-- ===========================================

CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  plan subscription_plan DEFAULT 'basic' NOT NULL,
  status subscription_status DEFAULT 'trialing' NOT NULL,
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN DEFAULT FALSE,
  claims_used_this_period INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE(user_id)
);

-- Enable RLS
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

-- Users can view their own subscription
CREATE POLICY "Users can view own subscription" ON subscriptions
  FOR SELECT USING (auth.uid() = user_id);

-- Admins can manage all subscriptions
CREATE POLICY "Admins can manage subscriptions" ON subscriptions
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- ===========================================
-- CLAIMS TABLE
-- ===========================================

CREATE TABLE IF NOT EXISTS claims (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  assigned_agent_id UUID REFERENCES users(id) ON DELETE SET NULL,
  category claim_category NOT NULL,
  subcategory TEXT,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  status claim_status DEFAULT 'draft' NOT NULL,
  resolution_type resolution_type,
  priority claim_priority DEFAULT 'normal' NOT NULL,
  opposing_party_name TEXT,
  opposing_party_contact TEXT,
  opposing_party_address TEXT,
  amount_claimed DECIMAL(12, 2),
  amount_recovered DECIMAL(12, 2),
  sla_deadline TIMESTAMPTZ,
  internal_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  submitted_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ
);

-- Create indexes
CREATE INDEX idx_claims_user_id ON claims(user_id);
CREATE INDEX idx_claims_assigned_agent_id ON claims(assigned_agent_id);
CREATE INDEX idx_claims_status ON claims(status);
CREATE INDEX idx_claims_category ON claims(category);
CREATE INDEX idx_claims_created_at ON claims(created_at DESC);

-- Enable RLS
ALTER TABLE claims ENABLE ROW LEVEL SECURITY;

-- Members can view their own claims
CREATE POLICY "Members can view own claims" ON claims
  FOR SELECT USING (auth.uid() = user_id);

-- Members can create claims
CREATE POLICY "Members can create claims" ON claims
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Members can update their draft claims
CREATE POLICY "Members can update draft claims" ON claims
  FOR UPDATE USING (auth.uid() = user_id AND status = 'draft');

-- Agents can view assigned claims
CREATE POLICY "Agents can view assigned claims" ON claims
  FOR SELECT USING (
    assigned_agent_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('staff', 'admin')
    )
  );

-- Agents can update assigned claims
CREATE POLICY "Agents can update assigned claims" ON claims
  FOR UPDATE USING (
    assigned_agent_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('staff', 'admin')
    )
  );

-- ===========================================
-- CLAIM DOCUMENTS TABLE
-- ===========================================

CREATE TABLE IF NOT EXISTS claim_documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  claim_id UUID REFERENCES claims(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  category document_category DEFAULT 'other' NOT NULL,
  uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Create indexes
CREATE INDEX idx_claim_documents_claim_id ON claim_documents(claim_id);

-- Enable RLS
ALTER TABLE claim_documents ENABLE ROW LEVEL SECURITY;

-- Users can view documents for their claims
CREATE POLICY "Users can view own claim documents" ON claim_documents
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM claims WHERE id = claim_id AND user_id = auth.uid()
    )
  );

-- Users can upload documents to their claims
CREATE POLICY "Users can upload claim documents" ON claim_documents
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM claims WHERE id = claim_id AND user_id = auth.uid()
    )
  );

-- Staff can view all documents
CREATE POLICY "Staff can view all documents" ON claim_documents
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('agent', 'staff', 'admin')
    )
  );

-- ===========================================
-- CLAIM MESSAGES TABLE
-- ===========================================

CREATE TABLE IF NOT EXISTS claim_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  claim_id UUID REFERENCES claims(id) ON DELETE CASCADE NOT NULL,
  sender_id UUID REFERENCES users(id) ON DELETE SET NULL NOT NULL,
  content TEXT NOT NULL,
  is_internal BOOLEAN DEFAULT FALSE,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Create indexes
CREATE INDEX idx_claim_messages_claim_id ON claim_messages(claim_id);
CREATE INDEX idx_claim_messages_created_at ON claim_messages(created_at DESC);

-- Enable RLS
ALTER TABLE claim_messages ENABLE ROW LEVEL SECURITY;

-- Users can view non-internal messages on their claims
CREATE POLICY "Users can view own claim messages" ON claim_messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM claims WHERE id = claim_id AND user_id = auth.uid()
    ) AND is_internal = FALSE
  );

-- Users can send messages on their claims
CREATE POLICY "Users can send claim messages" ON claim_messages
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM claims WHERE id = claim_id AND user_id = auth.uid()
    ) AND is_internal = FALSE
  );

-- Staff can view all messages including internal
CREATE POLICY "Staff can view all messages" ON claim_messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('agent', 'staff', 'admin')
    )
  );

-- Staff can send messages including internal
CREATE POLICY "Staff can send messages" ON claim_messages
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('agent', 'staff', 'admin')
    )
  );

-- ===========================================
-- CLAIM TIMELINE TABLE
-- ===========================================

CREATE TABLE IF NOT EXISTS claim_timeline (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  claim_id UUID REFERENCES claims(id) ON DELETE CASCADE NOT NULL,
  actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  description TEXT NOT NULL,
  metadata JSONB,
  is_public BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Create indexes
CREATE INDEX idx_claim_timeline_claim_id ON claim_timeline(claim_id);
CREATE INDEX idx_claim_timeline_created_at ON claim_timeline(created_at DESC);

-- Enable RLS
ALTER TABLE claim_timeline ENABLE ROW LEVEL SECURITY;

-- Users can view public timeline events for their claims
CREATE POLICY "Users can view own claim timeline" ON claim_timeline
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM claims WHERE id = claim_id AND user_id = auth.uid()
    ) AND is_public = TRUE
  );

-- Staff can view all timeline events
CREATE POLICY "Staff can view all timeline" ON claim_timeline
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('agent', 'staff', 'admin')
    )
  );

-- ===========================================
-- FUNCTIONS & TRIGGERS
-- ===========================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to users table
CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Apply to subscriptions table
CREATE TRIGGER update_subscriptions_updated_at
  BEFORE UPDATE ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Apply to claims table
CREATE TRIGGER update_claims_updated_at
  BEFORE UPDATE ON claims
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Function to create user profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO users (id, email, full_name, locale)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'locale', 'sq')
  );
  
  -- Create initial subscription (trial)
  INSERT INTO subscriptions (user_id, status)
  VALUES (NEW.id, 'trialing');
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger on auth.users insert
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Function to log claim status changes
CREATE OR REPLACE FUNCTION log_claim_status_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO claim_timeline (claim_id, actor_id, event_type, description, metadata)
    VALUES (
      NEW.id,
      auth.uid(),
      'status_change',
      'Status changed from ' || OLD.status || ' to ' || NEW.status,
      jsonb_build_object('old_status', OLD.status, 'new_status', NEW.status)
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger on claims status change
CREATE TRIGGER on_claim_status_change
  AFTER UPDATE ON claims
  FOR EACH ROW EXECUTE FUNCTION log_claim_status_change();
