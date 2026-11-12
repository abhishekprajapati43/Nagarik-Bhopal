import { useCallback, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import ComplaintQr from "../components/ComplaintQr";
import ShareMenu from "../components/ShareMenu";
import StatusBadge from "../components/StatusBadge";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";
import { useService } from "../hooks/useService";
import { messageFor } from "../shared/errors";
import { call } from "../utils/api";
import { complaintCategoryName, complaintTypeLabel } from "../utils/complaint";
import { formatDateTime, timeAgo } from "../utils/format";
import { prepareImage } from "../utils/image";
import "./ComplaintDetails.css";

const DECISION_KEY = {
  requested: "details.requested",
  verified: "details.verified",
  reopened: "details.reopened",
};

export default function ComplaintDetails() {
  const { id } = useParams();
  const { user } = useAuth();
  const { t } = useLanguage();
  const [message, setMessage] = useState("");
  const [commentDraft, setCommentDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [workDraft, setWorkDraft] = useState({
    beforePhoto: undefined,
    afterPhoto: undefined,
    workNotes: "",
    note: "",
  });

  const load = useCallback(() => call("getComplaint", { id }), [id]);
  const { data, loading, error, setData } = useService(load);

  const complaint = data?.complaint;
  const isAdmin = user?.role === "admin";

  // QR and share links point at this exact page, hash route included.
  const shareUrl = useMemo(
    () => (typeof window === "undefined" ? "" : window.location.href),
    [id]
  );

  const merge = (result) => {
    if (!result?.complaint) return;
    setData({ complaint: { ...complaint, ...result.complaint } });
  };

  const share = async () => {
    try {
      await navigator.clipboard?.writeText(shareUrl);
      setMessage(t("share.linkCopied"));
    } catch {
      setMessage(t("share.manual"));
    }
  };

  const upvote = async () => {
    if (!user) return;
    setBusy(true);
    setMessage("");

    try {
      const result = await call("upvoteComplaint", { id: complaint.id });
      merge(result);
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
      merge(result);
      setCommentDraft("");
    } catch (commentError) {
      setMessage(messageFor(commentError));
    } finally {
      setBusy(false);
    }
  };

  const verify = async (resolved) => {
    if (!user) return;
    setBusy(true);
    setMessage("");

    try {
      const result = await call("verifyComplaint", { id: complaint.id, resolved });
      merge(result);
      setMessage(result.message);
    } catch (verifyError) {
      setMessage(messageFor(verifyError));
    } finally {
      setBusy(false);
    }
  };

  const accept = async () => {
    setBusy(true);
    setMessage("");

    try {
      const result = await call("acceptComplaint", { id: complaint.id });
      merge(result);
      setMessage(result.message);
    } catch (acceptError) {
      setMessage(messageFor(acceptError));
    } finally {
      setBusy(false);
    }
  };

  const attachWorkPhoto = async (event, field) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setMessage("");

    try {
      const dataUrl = await prepareImage(file, { maxDimension: 1100, quality: 0.68 });
      setWorkDraft((current) => ({ ...current, [field]: dataUrl }));
    } catch (photoError) {
      setMessage(messageFor(photoError));
    }
  };

  const saveWork = async () => {
    setBusy(true);
    setMessage("");

    try {
      const result = await call("updateComplaintWork", {
        id: complaint.id,
        beforePhoto: workDraft.beforePhoto,
        afterPhoto: workDraft.afterPhoto,
        workNotes: workDraft.workNotes,
        note: workDraft.note,
      });
      merge(result);
      setWorkDraft({ beforePhoto: undefined, afterPhoto: undefined, workNotes: "", note: "" });
      setMessage(result.message);
    } catch (workError) {
      setMessage(messageFor(workError));
    } finally {
      setBusy(false);
    }
  };

  const canVerify =
    complaint?.verificationPending &&
    (user?.role === "admin" || (user?.role === "user" && complaint.userId === user.id));

  if (loading) {
    return (
      <div className="container">
        <h1>{t("common.loading")}</h1>
      </div>
    );
  }

  if (!complaint) {
    return (
      <div className="container">
        <h1>{t("details.notFound")}</h1>
        <p className="page-intro">{error || `Complaint #${id} does not exist.`}</p>
        <Link className="button button-dark" to="/complaints">
          {t("details.back")} <span aria-hidden="true">↗</span>
        </Link>
      </div>
    );
  }

  const representative = Boolean(
    complaint.representative && complaint.representative !== "Not assigned"
  );
  const hasRepresentativeDetails = representative || Boolean(complaint.mlaName);

  return (
    <div className="details">
      {complaint.image && (
        <img
          src={complaint.image}
          alt={`${complaintTypeLabel(complaint)} at ${complaint.address}`}
          className="banner"
        />
      )}

      <div className="info">
        <div className="details-head">
          <h1>{complaintTypeLabel(complaint)}</h1>
          <StatusBadge status={complaint.status} />
        </div>

        <p><b>{t("details.id")}:</b> #{complaint.id}</p>
        <p><b>{t("common.category")}:</b> {complaintCategoryName(complaint)}</p>
        <p><b>{t("details.issueType")}:</b> {complaintTypeLabel(complaint)}</p>
        <p><b>{t("details.address")}:</b> {complaint.address}</p>
        <p><b>{t("common.ward")}:</b> {complaint.ward || t("common.notAssigned")}</p>
        <p><b>{t("details.representative")}:</b> {complaint.representative || t("common.notAssigned")}</p>
        <p>
          <b>{t("details.officer")}:</b>{" "}
          {complaint.assignedOfficer
            ? `${complaint.assignedOfficer}${
                complaint.assignedOfficerCode ? ` (${complaint.assignedOfficerCode})` : ""
              }`
            : t("common.notAssigned")}
        </p>
        <p><b>{t("details.priority")}:</b> {complaint.priority}</p>
        <p><b>{t("common.status")}:</b> {t(`status.${complaint.status}`)}</p>
        <p>
          <b>{complaint.status === "Resolved" ? t("common.resolvedIn") : t("common.pending")}</b>{" "}
          {complaint.days === 1 ? t("common.day", { count: 1 }) : t("common.days", { count: complaint.days })}
        </p>
        <p><b>{t("common.reported")}:</b> {formatDateTime(complaint.createdAt)}</p>
        <p>{complaint.description}</p>

        {complaint.duplicateOfId && (
          <p className="details-note">
            {t("details.duplicate")} —{" "}
            <Link to={`/complaint/${complaint.duplicateOfId}`}>
              #{String(complaint.duplicateOfId).slice(-6)}
            </Link>
          </p>
        )}

        <div className="buttons">
          <button className="upvote" type="button" onClick={upvote} disabled={!user || busy}>
            👍 {t("details.meToo", { count: complaint.upvotes })}
          </button>
          <button className="share" type="button" onClick={share}>
            {t("common.share")}
          </button>
        </div>

        <ShareMenu url={shareUrl} title={complaintTypeLabel(complaint)} onMessage={setMessage} />

        {!user && (
          <p className="details-note">
            <Link to="/login">{t("nav.signIn")}</Link> {t("details.signInToComment")}
          </p>
        )}

        {message && <p className="form-message" role="status">{message}</p>}
      </div>

      {complaint.wardId && (
        <div className="comment-box">
          <h2>{t("details.wardInfo")}</h2>

          <dl className="detail-grid">
            <div>
              <dt>{t("details.wardNumber")}</dt>
              <dd>{complaint.wardNumber ?? t("common.notAssigned")}</dd>
            </div>
            <div>
              <dt>{t("details.wardName")}</dt>
              <dd>{complaint.ward || t("common.notAssigned")}</dd>
            </div>
            <div>
              <dt>{t("details.area")}</dt>
              <dd>{complaint.wardArea || t("common.notAssigned")}</dd>
            </div>
            <div>
              <dt>{t("details.zone")}</dt>
              <dd>
                {complaint.wardZone ||
                  (complaint.wardZoneNumber ? `Zone ${complaint.wardZoneNumber}` : t("common.notAssigned"))}
              </dd>
            </div>
            <div>
              <dt>{t("details.assemblyConstituency")}</dt>
              <dd>{complaint.wardAssemblyConstituency || t("common.notAssigned")}</dd>
            </div>
            <div>
              <dt>{t("details.councillor")}</dt>
              <dd>{complaint.wardCouncillorName || t("common.notAssigned")}</dd>
            </div>
            <div>
              <dt>{t("details.councillorMobile")}</dt>
              <dd>
                {complaint.wardCouncillorMobile ? (
                  <a href={`tel:${complaint.wardCouncillorMobile}`}>
                    {complaint.wardCouncillorMobile}
                  </a>
                ) : (
                  t("common.notAssigned")
                )}
              </dd>
            </div>
            {complaint.wardPopulation ? (
              <div>
                <dt>{t("details.population")}</dt>
                <dd>{Number(complaint.wardPopulation).toLocaleString("en-IN")}</dd>
              </div>
            ) : null}
          </dl>
        </div>
      )}

      {isAdmin && (
        <div className="comment-box admin-work-box">
          <h2>{t("details.adminPhotos")}</h2>
          <p className="details-note">{t("details.adminPhotosHint")}</p>

          <div className="work-photo-grid">
            <figure>
              <figcaption>{t("details.before")}</figcaption>
              {workDraft.beforePhoto || complaint.beforePhoto ? (
                <img
                  src={workDraft.beforePhoto || complaint.beforePhoto}
                  alt={t("details.before")}
                />
              ) : (
                <div className="photo-empty">{t("common.notAssigned")}</div>
              )}
              <input
                type="file"
                accept="image/*"
                aria-label={t("details.before")}
                onChange={(event) => attachWorkPhoto(event, "beforePhoto")}
              />
            </figure>

            <figure>
              <figcaption>{t("details.after")}</figcaption>
              {workDraft.afterPhoto || complaint.afterPhoto ? (
                <img
                  src={workDraft.afterPhoto || complaint.afterPhoto}
                  alt={t("details.after")}
                />
              ) : (
                <div className="photo-empty">{t("common.notAssigned")}</div>
              )}
              <input
                type="file"
                accept="image/*"
                aria-label={t("details.after")}
                onChange={(event) => attachWorkPhoto(event, "afterPhoto")}
              />
            </figure>
          </div>

          <label className="details-field">
            {t("details.workNotes")}
            <textarea
              rows="3"
              maxLength="1000"
              value={workDraft.workNotes}
              onChange={(event) =>
                setWorkDraft((current) => ({ ...current, workNotes: event.target.value }))
              }
            />
          </label>

          <label className="details-field">
            {t("details.adminNote")}
            <input
              maxLength="200"
              value={workDraft.note}
              onChange={(event) =>
                setWorkDraft((current) => ({ ...current, note: event.target.value }))
              }
            />
          </label>

          <div className="verification-actions">
            <button
              type="button"
              className="button button-dark"
              disabled={busy}
              onClick={saveWork}
            >
              {t("details.saveWork")}
            </button>

            {complaint.status === "Pending" && (
              <button
                type="button"
                className="button button-ghost"
                disabled={busy}
                onClick={accept}
              >
                {t("status.Accepted")}
              </button>
            )}
          </div>
        </div>
      )}

      {complaint.verificationPending && (
        <div className="comment-box verification-box">
          <h2>{t("details.resolvedQuestion")}</h2>
          <p>{t("details.resolvedIntro", { address: complaint.address })}</p>

          {canVerify ? (
            <div className="verification-actions">
              <button
                type="button"
                className="button button-dark"
                disabled={busy}
                onClick={() => verify(true)}
              >
                {t("details.yes")}
              </button>
              <button
                type="button"
                className="button button-ghost"
                disabled={busy}
                onClick={() => verify(false)}
              >
                {t("details.no")}
              </button>
            </div>
          ) : (
            <p className="details-note">{t("details.waitingCitizen")}</p>
          )}
        </div>
      )}

      {(complaint.beforePhoto || complaint.afterPhoto || complaint.workNotes) && (
        <div className="comment-box">
          <h2>{t("details.work")}</h2>

          <div className="work-photo-grid">
            {complaint.beforePhoto && (
              <figure>
                <figcaption>{t("details.before")}</figcaption>
                <img src={complaint.beforePhoto} alt={t("details.before")} />
              </figure>
            )}
            {complaint.afterPhoto && (
              <figure>
                <figcaption>{t("details.after")}</figcaption>
                <img src={complaint.afterPhoto} alt={t("details.after")} />
              </figure>
            )}
          </div>

          {complaint.workNotes ? (
            <p><b>{t("details.workNotes")}:</b> {complaint.workNotes}</p>
          ) : (
            <p className="details-note">{t("details.noWorkNotes")}</p>
          )}
        </div>
      )}

      {hasRepresentativeDetails && (
        <div className="comment-box">
          <h2>{t("details.representative")}</h2>

          <dl className="detail-grid">
            <div>
              <dt>{t("common.ward")}</dt>
              <dd>{complaint.ward}{complaint.wardArea ? ` · ${complaint.wardArea}` : ""}</dd>
            </div>
            <div>
              <dt>{t("details.corporator")}</dt>
              <dd>{complaint.representative || t("common.notAssigned")}</dd>
            </div>
            <div>
              <dt>{t("details.mla")}</dt>
              <dd>{complaint.mlaName || t("common.notAssigned")}</dd>
            </div>
            <div>
              <dt>{t("details.contact")}</dt>
              <dd>
                {complaint.representativePhone ? (
                  <a href={`tel:${complaint.representativePhone.replace(/\s+/g, "")}`}>
                    {complaint.representativePhone}
                  </a>
                ) : (
                  t("common.notAssigned")
                )}
              </dd>
            </div>
            <div>
              <dt>{t("details.office")}</dt>
              <dd>{complaint.officeAddress || t("common.notAssigned")}</dd>
            </div>
            <div>
              <dt>{t("details.email")}</dt>
              <dd>
                {complaint.representativeEmail ? (
                  <a href={`mailto:${complaint.representativeEmail}`}>
                    {complaint.representativeEmail}
                  </a>
                ) : (
                  t("common.notAssigned")
                )}
              </dd>
            </div>
          </dl>
        </div>
      )}

      {complaint.aiWasteType && (
        <div className="comment-box">
          <h2>{t("details.ai")}</h2>
          <p>
            {t("details.aiDetected", {
              type: complaint.aiWasteType,
              confidence: Math.round(Number(complaint.aiConfidence || 0) * 100),
            })}
          </p>
        </div>
      )}

      {(complaint.verificationHistory || []).length > 0 && (
        <div className="comment-box">
          <h2>{t("details.history")}</h2>
          <ol className="timeline">
            {(complaint.verificationHistory || []).map((entry, index) => (
              <li key={`${entry.at}-${index}`}>
                <b>{t(DECISION_KEY[entry.decision] || "details.requested")}</b>
                <p>{entry.note}</p>
                <small>{formatDateTime(entry.at)} · {entry.by || "System"}</small>
              </li>
            ))}
          </ol>
        </div>
      )}

      {(complaint.timeline || []).length > 0 && (
        <div className="comment-box">
          <h2>{t("details.timeline")}</h2>
          <ol className="timeline">
            {(complaint.timeline || []).map((entry, index) => (
              <li key={`${entry.at}-${index}`}>
                <StatusBadge status={entry.status} />
                <p>{entry.note || `Status changed to ${entry.status}.`}</p>
                <small>{formatDateTime(entry.at)} · {entry.by || "System"}</small>
              </li>
            ))}
          </ol>
        </div>
      )}

      <div className="comment-box">
        <h2>{t("details.comments", { count: complaint.comments?.length || 0 })}</h2>

        {(complaint.comments || []).length === 0 && (
          <p className="empty-state">{t("details.noComments")}</p>
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
              placeholder={t("details.commentPlaceholder")}
              maxLength="500"
              value={commentDraft}
              onChange={(event) => setCommentDraft(event.target.value)}
            />
            <button type="button" onClick={addComment} disabled={busy || commentDraft.trim().length < 2}>
              {t("details.postComment")}
            </button>
          </>
        ) : (
          <p className="details-note">
            <Link to="/login">{t("nav.signIn")}</Link> {t("details.signInToComment")}
          </p>
        )}
      </div>

      <div className="comment-box qr-section">
        <ComplaintQr value={shareUrl} filename={`complaint-${complaint.id}-qr`} />
        <ShareMenu url={shareUrl} title={complaintTypeLabel(complaint)} onMessage={setMessage} />
      </div>
    </div>
  );
}
