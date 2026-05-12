import json
import os
from typing import TypedDict

from dotenv import load_dotenv
from langchain_openai import ChatOpenAI
from langgraph.graph import END, START, StateGraph

from api.vector_store import search_notes

load_dotenv()

llm = ChatOpenAI(
    model="deepseek-chat",
    api_key=os.getenv("DEEPSEEK_API_KEY"),
    base_url="https://api.deepseek.com",
    temperature=0,
)


class GraphState(TypedDict):
    question: str
    user_id: str
    documents: list[dict]
    generation: str | None
    grounded: bool
    rewrite_count: int
    sources: list[dict]


def _parse_score(text: str, default: str) -> str:
    """Extract {"score": "yes"|"no"} from LLM response, stripping markdown fences."""
    cleaned = text.strip()
    if cleaned.startswith("```"):
        parts = cleaned.split("```")
        # parts[1] is the fenced block; strip leading "json" language tag if present
        inner = parts[1]
        if inner.startswith("json"):
            inner = inner[4:]
        cleaned = inner.strip()
    try:
        data = json.loads(cleaned)
        return data.get("score", default)
    except (json.JSONDecodeError, AttributeError, ValueError):
        return default


def retrieve(state: GraphState) -> dict:
    results = search_notes(state["question"], user_id=state["user_id"], limit=5)
    return {"documents": results}


def grade_documents(state: GraphState) -> dict:
    documents = state["documents"]
    if not documents:
        return {"documents": []}

    relevant = []
    for doc in documents:
        chief_complaint = doc.get("chief_complaint", "")
        subjective = doc.get("subjective", "")
        messages = [
            {
                "role": "system",
                "content": (
                    "You are a clinical relevance grader. Given a clinical "
                    "question and a retrieved SOAP note summary, grade whether "
                    "the note is relevant to answering the question. "
                    'Respond ONLY with JSON: {"score": "yes"} or '
                    '{"score": "no"}. No other text.'
                ),
            },
            {
                "role": "user",
                "content": (
                    f"Question: {state['question']}\n\n"
                    f"Note: {chief_complaint}. {subjective[:300]}"
                ),
            },
        ]
        response = llm.invoke(messages)
        score = _parse_score(response.content, default="no")
        if score == "yes":
            relevant.append(doc)

    return {"documents": relevant}


def decide_to_generate(state: GraphState) -> str:
    if len(state["documents"]) > 0:
        return "generate"
    elif state["rewrite_count"] < 1:
        return "rewrite_query"
    else:
        return "generate"


def rewrite_query(state: GraphState) -> dict:
    messages = [
        {
            "role": "system",
            "content": (
                "You are a clinical query optimizer. Rewrite the given "
                "question to improve retrieval from a database of "
                "outpatient psychiatry SOAP notes. Return only the "
                "rewritten question, no explanation."
            ),
        },
        {"role": "user", "content": state["question"]},
    ]
    response = llm.invoke(messages)
    return {
        "question": response.content.strip(),
        "rewrite_count": state["rewrite_count"] + 1,
    }


def generate(state: GraphState) -> dict:
    documents = state["documents"]
    if not documents:
        return {
            "generation": (
                "Insufficient context in stored notes to answer this question."
            ),
            "grounded": False,
            "sources": [],
        }

    context = "\n".join(
        f"Chief complaint: {doc.get('chief_complaint', '')}\n"
        f"Plan: {doc.get('plan', '')}\n"
        for doc in documents
    )
    messages = [
        {
            "role": "system",
            "content": (
                "You are a clinical documentation assistant. Answer the "
                "question using ONLY the provided SOAP note excerpts. "
                "Do not invent or infer information not present in the "
                "notes. Be concise and cite which notes support your answer."
            ),
        },
        {
            "role": "user",
            "content": f"Question: {state['question']}\n\nContext:\n{context}",
        },
    ]
    response = llm.invoke(messages)
    return {"generation": response.content, "sources": documents}


def grade_generation(state: GraphState) -> dict:
    # Both outcomes end the graph; this node writes grounded into state
    # so the caller can read it from the final result dict.
    documents = state["documents"]
    generation = state.get("generation") or ""

    if not documents:
        return {"grounded": False}

    context = "\n".join(
        f"Chief complaint: {doc.get('chief_complaint', '')}\n"
        f"Plan: {doc.get('plan', '')}\n"
        for doc in documents
    )
    messages = [
        {
            "role": "system",
            "content": (
                "You are a clinical fact-checker. Given retrieved SOAP "
                "notes and a generated answer, determine whether every "
                "claim in the answer is supported by the provided notes. "
                'Respond ONLY with JSON: {"score": "yes"} or {"score": "no"}.'
            ),
        },
        {
            "role": "user",
            "content": f"Notes:\n{context}\n\nAnswer: {generation}",
        },
    ]
    response = llm.invoke(messages)
    # Fail-safe for generation grader: default "yes" (keep answer rather than
    # silently discard it when JSON parsing breaks).
    score = _parse_score(response.content, default="yes")
    return {"grounded": score == "yes"}


def build_graph() -> StateGraph:
    graph = StateGraph(GraphState)

    graph.add_node("retrieve", retrieve)
    graph.add_node("grade_documents", grade_documents)
    graph.add_node("rewrite_query", rewrite_query)
    graph.add_node("generate", generate)
    graph.add_node("grade_generation", grade_generation)

    graph.add_edge(START, "retrieve")
    graph.add_edge("retrieve", "grade_documents")
    graph.add_conditional_edges(
        "grade_documents",
        decide_to_generate,
        {
            "generate": "generate",
            "rewrite_query": "rewrite_query",
        },
    )
    graph.add_edge("rewrite_query", "retrieve")
    graph.add_edge("generate", "grade_generation")
    graph.add_edge("grade_generation", END)

    return graph


ask_graph = build_graph().compile()


def run_ask(question: str, user_id: str = "anonymous") -> dict:
    return ask_graph.invoke(
        {
            "question": question,
            "user_id": user_id,
            "documents": [],
            "generation": None,
            "grounded": False,
            "rewrite_count": 0,
            "sources": [],
        }
    )
