Read SPEC.md for full context. Phase 1 (rooms) and Phase 2 (game engine) are complete and working. The game is fully playable but the UI is basic.

Implement Phase 3: UI/UX Polish. Focus on making it feel smooth and fun on both desktop and mobile.

**1. Layout & Responsiveness**
- Mobile-first responsive design. The primary use case is people on their phones.
- Game hand should be swipeable/scrollable on mobile, card grid on desktop
- Black card should always be visible during play
- Submission cards during judging should be easy to tap on mobile

**2. Visual Design**
- Dark theme by default (fits the game's irreverent tone)
- Cards should look like cards — white cards with dark text, black cards with white text
- Clean sans-serif typography
- Room code should be large and easy to read/share
- Player list should clearly distinguish humans from bots (different styling, not just label)
- Czar should have a visible crown/indicator

**3. Transitions & Feedback**
- Smooth phase transitions (fade/slide between submitting → judging → result)
- Card submission: visual confirmation when cards are selected and submitted
- Round result: winning card highlighted with animation, winner's name prominent
- Toast notifications: player joined, player left, new round starting
- Loading/waiting states: clear spinners or skeleton screens during API calls

**4. Connection & Error UX**
- Connection status indicator (connected/reconnecting/disconnected)
- If Pusher disconnects, show banner with "Reconnecting..." and auto-retry
- Graceful error modals instead of raw error text
- "Return Home" button on all error states

**5. Game Over Screen**
- Ranked scoreboard with visual hierarchy (1st place prominent)
- Final round's winning card displayed
- "Play Again" and "Leave Room" buttons clearly positioned

**6. Quality of Life**
- Copy room code: tap to copy with brief "Copied!" confirmation
- Share link: same copy-to-clipboard behavior
- Player names truncated gracefully if too long
- Prevent double-tap/double-click on submit and judge buttons

Do NOT implement bot personalities, sound effects, or theming options in this phase. Keep it focused on making the existing functionality feel polished.
