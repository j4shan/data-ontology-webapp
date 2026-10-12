# Graph Visualization Website Requirements

The website consumes the graph service APIs. It provides human exploration and agent-run inspection while the graph service remains a read-only evidence service. These requirements were confirmed by the user on 2026-10-11; delivery is staged as website backbone, Function #1, and Function #2.

## 1. Website structure

| ID | Requirement |
| --- | --- |
| 1.1 | The product is an interactive website. Each function is embedded in its own independent tab. |

## 2. Function #1 — Graph visualizer

| ID | Requirement |
| --- | --- |
| 2.1 | The function offers logical entity search through a search panel containing a text box and a result viewer. As the visitor types a prefix, the viewer displays the grouped, ranked graph search response. The visitor can select one result item at a time. |
| 2.2 | The visualizer shows the selected node or edge object, or the object containing the selected search item, such as the dataset containing a matched column. |
| 2.3 | The visualizer expands the local neighborhood using breadth-first search with a bounded depth. Visual emphasis decreases as depth from the selected item increases. |
| 2.4 | The visitor can select a neighboring node or edge to reposition the view without another action in the search panel. |

## 3. Function #2 — AKG workbench

| ID | Requirement |
| --- | --- |
| 3.1 | The visitor selects a data catalog and a test question from its BI question set, then submits the selected question through a button. McDonald's is an example catalog. |
| 3.2 | Submission invokes a configured AI agent with graph-service guidance to analyze the question and build an abstract knowledge graph (AKG). GPT/Codex, Cursor, and Claude are candidate agent backends. |
| 3.3 | The interface displays the trajectory of graph API calls and the agent's AKG response. |
