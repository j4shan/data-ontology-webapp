# Product functional requirements

## Actors

**1.1** Visitors use a client-facing browser webapp to explore data catalogs and inspect agent-generated answers to BI questions.

## Capabilities

**2.1** The webapp provides Graph explorer and AKG workbench in independent tabs, with catalog selection through a dropdown restricted to the configured pre-built set. Choosing a catalog automatically refreshes the graph view and scopes search to that catalog, without a separate refresh or submit action.

**2.2** Graph explorer provides a search panel with a text box and result viewer. As visitors type a prefix, the viewer displays the selected catalog’s grouped, ranked search response and allows one result to be selected at a time.

**2.3** Selecting a search result focuses its node or edge, or its containing graph object when the result represents a component such as a data column. The visualizer expands that focus’s local neighborhood using breadth-first search with a bounded depth, fading objects as their distance from the focus increases. Visitors can select a neighboring node or edge to recenter the view without another action in the search panel.

**2.4** In the AKG workbench, visitors choose a test question from the selected catalog’s BI question set and submit it through a button. Submission invokes a configured AI agent equipped with the graph-service skill to evaluate the question and assemble an abstract knowledge graph (AKG). The workbench displays the agent’s graph API-call trajectory and AKG response for that question.

## Concepts

**3.1** A data catalog groups the graph knowledge for a particular data domain and identifies the BI question set used to examine that knowledge. The initial demo catalog set contains McDonald’s and Starbucks.

**3.2** Question-run evidence comprises the AKG assembled by the configured agent using graph-service evidence and the ordered trajectory of graph-service calls made while evaluating the submitted BI question.

## Exclusions

**4.1** External agent access belongs to the standard ontology graph service; the webapp does not provide a separate SDK or CLI.

**4.2** Catalog knowledge is read-only in the demo: visitors explore existing knowledge and inspect agent responses without modifying the underlying catalog.

**4.3** Visitor-facing pages exclude developer delivery labels, CLI/SDK instructions, and infrastructure footnotes such as Available Now and Localhost first · Website backbone.
