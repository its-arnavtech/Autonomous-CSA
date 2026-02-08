# Autonomous-CSA
A web app where a “company” can connect an inbox (start with a built-in inbox, add Gmail/Zendesk later), and the AI agent will classify and prioritize tickets then pull necessary data(docs, past tickets) then decide whether to answer or ask clarifying questions or escalate draft a response 

- Set up monorepo web/api/worker architecture
- Implemented async ticket processing via BullMQ + Redis
- Added worker-based ticket processor (ticket.process)
- Introduced append-only agent timeline events
- Exposed timeline API endpoint (GET /tickets/:id/timeline)
- Added Next.js proxy route for API access
- Built initial Ticket page UI to render agent timeline
- Hardened server-side fetching and error handling
- Fixed App Router layout requirements and global styles
