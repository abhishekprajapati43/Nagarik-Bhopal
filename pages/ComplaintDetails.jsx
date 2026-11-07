import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getComplaint } from "../utils/storage";
import "./ComplaintDetails.css";

const initialComments = [
  { id: 1, user: "Rahul", text: "Garbage is still there." },
  { id: 2, user: "Ankit", text: "Please clean this area." },
];

export default function ComplaintDetails() {
  const { id } = useParams();
  const complaint = getComplaint(id);
  const [comments, setComments] = useState(initialComments);
  const [message, setMessage] = useState("");

  if (!complaint) {
    return (
      <div className="container">
        <h1>Complaint not found</h1>
        <p className="page-intro">Complaint #{id} is not stored on this device.</p>
        <Link className="button button-dark" to="/complaints">
          Back to complaints <span aria-hidden="true">↗</span>
        </Link>
      </div>
    );
  }

  const addComment = () => {
    if (message.trim() === "") return;

    setComments([...comments, { id: Date.now(), user: "You", text: message.trim() }]);
    setMessage("");
  };

  return (
    <div className="details">
      {complaint.image && <img src={complaint.image} alt="" className="banner" />}

      <div className="info">
        <h1>{complaint.wasteType}</h1>
        <p><b>Complaint ID:</b> #{complaint.id}</p>
        <p><b>Address:</b> {complaint.address}</p>
        <p><b>Ward:</b> {complaint.ward || "Not assigned"}</p>
        <p><b>Representative:</b> {complaint.representative || "Not assigned"}</p>
        <p><b>MLA:</b> {complaint.mla || "Bhopal"}</p>
        <p><b>Status:</b> {complaint.status}</p>
        <p><b>Pending:</b> {complaint.days} {complaint.days === 1 ? "Day" : "Days"}</p>
        <p>{complaint.description}</p>

        <div className="buttons">
          <button className="upvote" type="button">👍 Me Too</button>
          <button
            className="share"
            type="button"
            onClick={() => navigator.clipboard?.writeText(window.location.href)}
          >
            Share
          </button>
        </div>
      </div>

      <div className="comment-box">
        <h2>Comments</h2>

        {comments.map((item) => (
          <div className="comment" key={item.id}>
            <b>{item.user}</b>
            <p>{item.text}</p>
          </div>
        ))}

        <textarea
          placeholder="Write comment..."
          value={message}
          onChange={(event) => setMessage(event.target.value)}
        />
        <button type="button" onClick={addComment}>Post Comment</button>
      </div>
    </div>
  );
}
