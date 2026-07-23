# Crypto Watcher Bot — Bot specification

**Archetype:** custom

**Voice:** professional and concise — write every user-facing message, button label, error, and empty state in this voice.

A private Telegram bot for tracking crypto prices with customizable price threshold alerts, percentage move alerts, on-demand price checks, and optional daily summaries. Features quiet hours, alert cooldowns, error handling for unknown tickers, and admin stats for usage analytics.

> This is the complete contract for the bot. Implement EVERY entry point, flow, feature, integration, and edge case below. The completeness review checks the bot against this document after each build pass.

## Primary audience

- individual crypto traders
- crypto investors

## Success criteria

- users receive accurate price alerts within 1 minute of threshold/percent change trigger
- daily summaries delivered at user-specified local time
- admin can view total users and top 10 most-fired alerts

## Entry points

Every feature must be reachable from the bot's command/button surface (button-first; only /start and /help are slash commands).

- **/start** (command, actor: user, command: /start) — Open main menu with watchlist management and settings
- **Add common coin** (button, actor: user, callback: watchlist:add_common) — Add pre-seeded popular crypto (BTC, ETH, TON, etc.)
  - inputs: coin selection
  - outputs: updated watchlist confirmation
- **Manage alerts** (button, actor: user, callback: alerts:manage) — View/edit active alerts for watchlist items
  - inputs: alert type selection
  - outputs: alert configuration interface
- **/price** (command, actor: user, command: /price) — Request current price of specific coin or full watchlist
  - inputs: ticker symbol or 'all'], outputs': [
- **Daily summary settings** (button, actor: user, callback: summary:configure) — Enable/disable morning summaries and set delivery time
  - inputs: time selection
  - outputs: confirmation of summary settings

## Flows

### Onboarding
_Trigger:_ /start

1. Explain core features
2. Request timezone selection
3. Confirm quiet hours defaults
4. Show initial watchlist options

_Data touched:_ user profile

### Price alert creation
_Trigger:_ alert creation button

1. Select coin from watchlist
2. Choose alert type (threshold/percent)
3. Configure parameters (above/below price or percent/window)
4. Confirm alert rules via buttons

_Data touched:_ watchlist item, alert record

### Daily summary delivery
_Trigger:_ scheduled local time

1. Check user's summary preference
2. Aggregate price changes for all watchlist items
3. Format summary with notable moves (>1% changes)
4. Send message with optional CTA buttons

_Data touched:_ user profile, watchlist item

### Error handling
_Trigger:_ unknown ticker input

1. Detect invalid ticker
2. Suggest common alternatives
3. Offer to search for closest matches
4. Request clarification

_Data touched:_ user input history

## Data entities

Durable data (must survive a restart) uses the toolkit's persistent store, never in-memory maps.

- **user_profile** _(retention: persistent)_ — User preferences and metadata
  - fields: telegram_id, timezone, quiet_hours_start, quiet_hours_end, summary_time, alert_cooldown_length, subscription_status
- **watchlist_item** _(retention: persistent)_ — Tracked cryptocurrency with alert rules
  - fields: ticker, friendly_name, price_threshold_type, target_price, percent_alert_value, alert_window_minutes, enabled_flag, last_alert_time, last_alert_price
- **alert_record** _(retention: persistent)_ — Historical alert events
  - fields: user_id, ticker, alert_type, old_price, new_price, percent_change, timestamp

## Integrations

- **Telegram** (required) — Bot API messaging and inline keyboards
Call external APIs against their real contract (correct endpoints, ids, params); credentials from env. Do not fake responses.

## Owner controls

- admin command /stats to view total users and top 10 alerts
- private admin chat for configuration changes
- ability to override defaults for specific users

## Notifications

- Price threshold alerts
- Percentage move alerts
- Daily summary messages
- Error correction suggestions

## Permissions & privacy

- All user data encrypted at rest
- No third-party data sharing
- User consent required for data retention
- Aggregate stats anonymized

## Edge cases

- Handling price feed outages with silent retries
- Managing alert cooldowns during quiet hours
- Resolving ambiguous ticker symbols
- Handling time zone conversions for scheduled alerts

## Required tests

- End-to-end alert triggering with cooldown enforcement
- Daily summary formatting with multiple price changes
- Error handling for invalid ticker inputs
- Quiet hours suppression and queue management

## Assumptions

- Using CoinGecko API for price data (not specified in brief)
- Default alert cooldown of 1 hour is acceptable
- Seed watchlist covers most popular cryptos
