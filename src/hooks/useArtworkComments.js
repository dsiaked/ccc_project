import { useEffect, useState } from 'react';
import { addDoc, collection, deleteDoc, doc, onSnapshot, query, serverTimestamp, updateDoc, where } from 'firebase/firestore';
import { db } from '../firebase';

const getCommentClientId = () => {
  const existingId = localStorage.getItem('comment_client_id');
  if (existingId) return existingId;

  const newId = crypto.randomUUID();
  localStorage.setItem('comment_client_id', newId);
  return newId;
};

const getCommentTime = comment => (
  comment.createdAt?.seconds ||
  (comment.createdAt instanceof Date ? comment.createdAt.getTime() / 1000 : 0)
);

export const formatCommentDate = createdAt => {
  if (!createdAt) return '방금 전';

  const date = createdAt.toDate ? createdAt.toDate() : new Date(createdAt);
  const diffMins = Math.floor((Date.now() - date.getTime()) / 60000);

  if (diffMins < 1) return '방금 전';
  if (diffMins < 60) return `${diffMins}분 전`;

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}시간 전`;

  return date.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
};

export default function useArtworkComments(artistId) {
  const [comments, setComments] = useState([]);
  const [loadingComments, setLoadingComments] = useState(true);
  const [newName, setNewName] = useState(() => localStorage.getItem('comment_author_name') || '');
  const [clientId] = useState(getCommentClientId);
  const [newContent, setNewContent] = useState('');
  const [editingCommentId, setEditingCommentId] = useState(null);
  const [editContent, setEditContent] = useState('');

  const isOwnComment = comment => {
    if (comment.clientId) return comment.clientId === clientId;
    return comment.name?.trim() === newName.trim() && newName.trim().length > 0;
  };

  const cancelEditComment = () => {
    setEditingCommentId(null);
    setEditContent('');
  };

  useEffect(() => {
    setLoadingComments(true);

    const timeoutId = window.setTimeout(() => {
      setLoadingComments(false);
    }, 1500);

    const commentsQuery = query(
      collection(db, 'comments'),
      where('artistId', '==', artistId),
    );

    const unsubscribe = onSnapshot(
      commentsQuery,
      snapshot => {
        window.clearTimeout(timeoutId);
        const nextComments = snapshot.docs
          .map(commentDoc => ({ id: commentDoc.id, ...commentDoc.data() }))
          .sort((a, b) => getCommentTime(b) - getCommentTime(a));

        setComments(nextComments);
        setLoadingComments(false);
      },
      error => {
        window.clearTimeout(timeoutId);
        console.error('댓글 로드 실패:', error);
        setComments([]);
        setLoadingComments(false);
      },
    );

    return () => {
      window.clearTimeout(timeoutId);
      unsubscribe();
    };
  }, [artistId]);

  const handleAddComment = async event => {
    event.preventDefault();
    const trimmedName = newName.trim();
    const trimmedContent = newContent.trim();

    if (!trimmedName || !trimmedContent) return;

    try {
      await addDoc(collection(db, 'comments'), {
        artistId,
        name: trimmedName,
        content: trimmedContent,
        clientId,
        isPublished: false,
        createdAt: serverTimestamp(),
      });
      setNewContent('');
      localStorage.setItem('comment_author_name', trimmedName);
    } catch (error) {
      console.error('댓글 등록 실패:', error);
    }
  };

  const startEditComment = comment => {
    if (!isOwnComment(comment)) return;
    setEditingCommentId(comment.id);
    setEditContent(comment.content || '');
  };

  const handleUpdateComment = async commentId => {
    const comment = comments.find(item => item.id === commentId);
    const trimmedContent = editContent.trim();

    if (!comment || !isOwnComment(comment) || !trimmedContent) return;

    try {
      await updateDoc(doc(db, 'comments', commentId), {
        content: trimmedContent,
        updatedAt: serverTimestamp(),
      });
      cancelEditComment();
    } catch (error) {
      console.error('댓글 수정 실패:', error);
    }
  };

  const handleDeleteComment = async commentId => {
    const comment = comments.find(item => item.id === commentId);
    if (!comment || !isOwnComment(comment)) return;
    if (!window.confirm('이 감상평을 삭제할까요?')) return;

    try {
      await deleteDoc(doc(db, 'comments', commentId));
      if (editingCommentId === commentId) {
        cancelEditComment();
      }
    } catch (error) {
      console.error('댓글 삭제 실패:', error);
    }
  };

  return {
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
  };
}
