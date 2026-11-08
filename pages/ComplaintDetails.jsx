import { useCallback, useState } from "react";
import { Link, useParams } from "react-router-dom";
import StatusBadge from "../components/StatusBadge";
import { useAuth } from "../context/AuthContext";
import { useService } from "../hooks/useService";
import { messageFor } from "../shared/errors";
import { call } from "../utils/api";
import { formatDateTime, timeAgo } from "../utils/format";
import "./ComplaintDetails.css";

export default function ComplaintDetails() {
  const { id } = useParams();
  const { user } = useAuth();
  const [message, setMessage] = useState("");
  const [commentDraft, setCommentDraft] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => call("getComplaint", { id }), [id]);
  const { data, loading, error, setData } = useService(load);

  const complaint = data?.complaint;

  const share = async () => {
    try {
      await navigator.clipboard?.writeText(window.location.href);
      setMessage("Link copied to your clipboard.");
    } catch {
      setMessage("Copy this page URL from the address bar to share it.");
    }
  };

  const upvote = async () => {
    if (!user) return;
    setBusy(true);
    setMessage("");

    try {
      const result = await call("upvoteComplaint", { id: complaint.id });
      setData({ complaint: { ...complaint, ...result.complaint } });
      setMessage(result.message);
    } catch (voteError) {
      setMessage(messageFor(voteError));
    } finally {
      setBusy(false);
    }
  };

  const addComment = async () => {
    if (!user || commentDraft.trim().length < 2) return;
    setBusy(true);
    setMessage("");

    try {
      const result = await call("addComment", { id: complaint.id, text: commentDraft });
      setData({ complaint: { ...complaint, ...result.complaint } });
      setCommentDraft("");
    } catch (commentError) {
      setMessage(messageFor(commentError));
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="container">
        <h1>Loading complaint…</h1>
      </div>
    );
  }

  if (!complaint) {
    return (
      <div className="container">
        <h1>Complaint not found</h1>
        <p className="page-intro">{error || `Complaint #${id} does not exist.`}</p>
        <Link className="button button-dark" to="/complaints">
          Back to complaints <span aria-hidden="true">↗</span>
        </Link>
      </div>
    );
  }

  return (
    <div className="details">
      {complaint.image && (
        <img src={complaint.image} alt={`${complaint.wasteType} at ${complaint.address}`} className="banner" />
      )}

      <div className="info">
        <div className="details-head">
          <h1>{complaint.wasteType}</h1>
          <StatusBadge status={complaint.status} />
        </div>

        <p><b>Complaint ID:</b> #{complaint.id}</p>
        <p><b>Address:</b> {complaint.address}</p>
        <p><b>Ward:</b> {complaint.ward || "Not assigned"}</p>
        <p><b>Representative:</b> {complaint.representative || "Not assigned"}</p>
        <p><b>MLA:</b> {complaint.mla || "Bhopal"}</p>
        <p><b>Priority:</b> {complaint.priority}</p>
        <p><b>Status:</b> {complaint.status}</p>
        <p>
          <b>{complaint.status === "Resolved" ? "Resolved in:" : "Pending:"}</b> {complaint.days}{" "}
          {complaint.days === 1 ? "day" : "days"}
        </p>
        <p><b>Reported:</b> {formatDateTime(complaint.createdAt)}</p>
        <p>{complaint.description}</p>

        <div className="buttons">
          <button className="upvote" type="button" onClick={upvote} disabled={!user || busy}>
            👍 Me Too ({complaint.upvotes})
          </button>
          <button className="share" type="button" onClick={share}>
            Share
          </button>
        </div>

        {!user && (
          <p className="details-note">
            <Link to="/login">Sign in</Link> to upvote this report or add a comment.
          </p>
        )}

        {message && <p className="form-message" role="status">{message}</p>}
      </div>

      {(complaint.timeline || []).length > 0 && (
        <div className="comment-box">
          <h2>Progress timeline</h2>
          <ol className="timeline">
            {(complaint.timeline || []).map((entry, index) => (
              <li key={`${entry.at}-${index}`}>
                <StatusBadge status={entry.status} />
                <p>{entry.note || `Status changed to ${entry.status}.`}</p>
                <small>{timeAgo(entry.at)} · {entry.by || "System"}</small>
              </li>
            ))}
          </ol>
        </div>
      )}

      <div className="comment-box">
        <h2>Comments ({complaint.comments?.length || 0})</h2>

        {(complaint.comments || []).length === 0 && (
          <p className="empty-state">No comments yet. Be the first to add context.</p>
        )}

        {(complaint.comments || []).map((item) => (
          <div className="comment" key={item.id}>
            <div className="comment-head">
              <b>{item.userName}</b>
              <small>{timeAgo(item.createdAt)}</small>
            </div>
            <p>{item.text}</p>
          </div>
        ))}

        {user ? (
          <>
            <textarea
              placeholder="Write comment..."
              maxLength="500"
              value={commentDraft}
              onChange={(event) => setCommentDraft(event.target.value)}
            />
            <button type="button" onClick={addComment} disabled={busy || commentDraft.trim().length < 2}>
              Post Comment
            </button>
          </>
        ) : (
          <p className="details-note">
            <Link to="/login">Sign in</Link> to join the conversation.
          </p>
        )}
      </div>
    </div>
  );
}
