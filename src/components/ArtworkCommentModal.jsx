import React from 'react';
import { MessageSquare, Pencil, Send, Trash2, X } from 'lucide-react';

export default function ArtworkCommentModal({
  commentsApi,
  onClose,
  uiText,
  accent = '#10b981',
  accentTextClass = 'text-emerald-500',
  accentNameClass = 'text-emerald-800',
  accentBgClass = 'bg-emerald-50/30 border-emerald-100/50',
  focusRingClass = 'focus:ring-emerald-400',
}) {
  const {
    comments,
    loadingComments,
    newName,
    setNewName,
    newContent,
    setNewContent,
    editingCommentId,
    editContent,
    setEditContent,
    handleAddComment,
    startEditComment,
    cancelEditComment,
    handleUpdateComment,
    handleDeleteComment,
    isOwnComment,
    formatCommentDate,
  } = commentsApi;

  const canSubmit = newName.trim() && newContent.trim();

  return (
    <div className="absolute inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-[2px] animate-in fade-in duration-200">
      <div className="relative w-[310px] h-[520px] rounded-[24px] bg-white border border-gray-100 flex flex-col p-5 shadow-2xl animate-in zoom-in-95 duration-200">
        <div className="flex justify-between items-center pb-3 border-b border-gray-100">
          <div className="flex items-center gap-1.5">
            <span className={`text-lg font-bold font-sentiment ${accentTextClass}`}>
              {uiText.leaveComment}
            </span>
            <MessageSquare className={`h-4 w-4 ${accentTextClass}`} />
            <span className="bg-gray-100 text-gray-600 text-xs px-2 py-0.5 rounded-full font-bold">
              {comments.length}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 bg-gray-50 border border-gray-100 hover:bg-gray-100 rounded-full flex items-center justify-center text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto popup-body-scroll my-3 pr-1 space-y-3 select-text">
          {loadingComments ? (
            <div className="h-full flex flex-col items-center justify-center text-gray-400 text-xs gap-2 py-10">
              <div className="w-6 h-6 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" />
              <span>{uiText.loadingComments}</span>
            </div>
          ) : comments.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-gray-400 text-xs py-10 text-center leading-relaxed animate-in fade-in duration-300">
              <MessageSquare className={`mb-2 h-8 w-8 ${accentTextClass}`} />
              <span className="font-bold text-gray-600 text-sm">{uiText.firstComment}</span>
              <span className="opacity-70 mt-1">{uiText.noComments}</span>
              <span className="opacity-60 mt-0.5">{uiText.firstCommentHint}</span>
            </div>
          ) : (
            comments.map(comment => {
              const isEditing = editingCommentId === comment.id;
              const canManage = isOwnComment(comment);

              return (
                <div key={comment.id} className={`${accentBgClass} p-3 rounded-2xl flex flex-col gap-2 shadow-sm border`}>
                  <div className="flex justify-between items-center gap-2">
                    <span className={`font-bold text-xs truncate ${accentNameClass}`}>{comment.name}</span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-[10px] text-gray-400">{formatCommentDate(comment.createdAt)}</span>
                      {canManage && !isEditing && (
                        <>
                          <button
                            type="button"
                            onClick={() => startEditComment(comment)}
                            className="w-6 h-6 rounded-full bg-white/80 border border-gray-100 text-gray-400 hover:text-gray-700 flex items-center justify-center transition-colors cursor-pointer"
                            title={uiText.edit}
                          >
                            <Pencil className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteComment(comment.id)}
                            className="w-6 h-6 rounded-full bg-white/80 border border-gray-100 text-gray-400 hover:text-red-500 hover:border-red-100 flex items-center justify-center transition-colors cursor-pointer"
                            title={uiText.delete}
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {isEditing ? (
                    <div className="flex flex-col gap-2">
                      <textarea
                        value={editContent}
                        onChange={event => setEditContent(event.target.value)}
                        maxLength={100}
                        rows={3}
                        className="w-full px-3 py-2 text-xs border border-gray-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-gray-300 font-readable-sans resize-none bg-white/80 text-gray-800 leading-relaxed"
                      />
                      <div className="flex justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={cancelEditComment}
                          className="h-7 px-3 rounded-full border border-gray-200 bg-white text-[11px] font-bold text-gray-500 hover:bg-gray-50 cursor-pointer"
                        >
                          {uiText.cancel}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleUpdateComment(comment.id)}
                          disabled={!editContent.trim()}
                          className="h-7 px-3 rounded-full bg-gray-800 disabled:bg-gray-300 text-[11px] font-bold text-white cursor-pointer"
                        >
                          {uiText.save}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-gray-700 text-xs leading-relaxed break-all whitespace-pre-wrap">{comment.content}</p>
                  )}
                </div>
              );
            })
          )}
        </div>

        <form onSubmit={handleAddComment} className="flex flex-col gap-2 border-t border-gray-100 pt-3 mt-auto">
          <input
            type="text"
            placeholder={uiText.namePlaceholder}
            value={newName}
            onChange={event => setNewName(event.target.value)}
            maxLength={10}
            className={`w-full px-3 py-2 text-xs border border-gray-200 rounded-xl focus:outline-none focus:ring-1 ${focusRingClass} font-readable-sans bg-gray-50/50 text-gray-800`}
            required
          />
          <div className="relative">
            <textarea
              placeholder={uiText.commentPlaceholder}
              value={newContent}
              onChange={event => setNewContent(event.target.value)}
              maxLength={100}
              rows={2}
              className={`w-full pl-3 pr-10 py-2 text-xs border border-gray-200 rounded-xl focus:outline-none focus:ring-1 ${focusRingClass} font-readable-sans resize-none bg-gray-50/50 text-gray-800 leading-normal`}
              required
            />
            <button
              type="submit"
              disabled={!canSubmit}
              className="absolute right-2 bottom-3 p-1.5 disabled:bg-gray-300 text-white rounded-lg flex items-center justify-center transition-all duration-200 active:scale-95 shadow-sm cursor-pointer"
              style={{ backgroundColor: canSubmit ? accent : undefined }}
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
