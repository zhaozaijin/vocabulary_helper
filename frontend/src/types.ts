export interface ClassRoom {
  id: string;
  name: string;
  grade: string;
  teacher_id: string;
}

export interface Student {
  id: string;
  name: string;
  role: string;
  class_id: string;
}

export interface Lesson {
  id: string;
  grade: string;
  volume: string;
  unit_no: number;
  title: string;
  content: string;
  chars: CharacterItem[];
}

export interface CharacterItem {
  char: string;
  pinyin: string;
  display_pinyin: string;
  radical: string;
  structure: string;
  stroke_count?: number;
  stroke_order?: string[];
  words: string[];
  simple_sentence?: string;
  common_mistakes?: string[];
  confusing_chars?: Array<{ char: string; reason: string }>;
  needs_teacher_review?: boolean;
}

export interface LearningPackContent {
  lesson: {
    grade: string;
    volume: string;
    unit: string;
    title: string;
  };
  characters: CharacterItem[];
  dictation_items: Array<{
    type: string;
    answer: string;
    prompt_text: string;
    audio_text: string;
    difficulty: number;
    char: string;
  }>;
  review_notes: string[];
}

export type DictationPackItem = LearningPackContent['dictation_items'][number];

export interface LearningPack {
  id: string;
  title: string;
  status: string;
  content: LearningPackContent;
  ai_status?: string;
}

export interface DictationItem {
  id: string;
  task_id: string;
  item_type: string;
  prompt_text: string;
  answer: string;
  audio_text: string;
  order_no: number;
  difficulty: number;
  answer_meta?: {
    char?: string;
    difficulty?: number;
    original_answer?: string;
    question_type?: string;
    display_pinyin?: string;
    options?: string[];
  };
}

export interface DictationTask {
  id: string;
  class_id: string;
  teacher_id: string;
  learning_pack_id: string;
  title: string;
  mode: string;
  status: string;
  settings: Record<string, unknown>;
  deadline?: string | null;
  items: DictationItem[];
  submission?: {
    id: string;
    status: string;
    correct_count: number;
    total_count: number;
  };
}

export interface AnswerResult {
  id: string;
  result: 'correct' | 'wrong' | 'suspected' | 'pending_review';
  raw_answer: string;
  normalized_answer: string;
  mistake_type?: string;
  feedback: {
    message: string;
    correct_answer: string;
    tips: string[];
  };
  item: {
    id?: string;
    item_type?: string;
    prompt_text: string;
    answer: string;
    audio_text: string;
    order_no: number;
    answer_meta?: Record<string, unknown>;
  };
}

export interface Submission {
  id: string;
  task_id: string;
  student_id: string;
  status: string;
  total_count: number;
  correct_count: number;
  wrong_count: number;
  suspected_count: number;
  pending_review_count: number;
  answers: AnswerResult[];
}

export interface AnswerSheetResult {
  provider: string;
  confidence: number;
  recognized_answers: string[];
  answers: AnswerResult[];
  submission: Submission;
}

export interface MaterialExtractResult {
  provider: string;
  confidence: number;
  extracted_text: string;
  filename?: string;
}

export interface MistakeRecord {
  id: string;
  student_id: string;
  char_or_word: string;
  mistake_type: string;
  wrong_count: number;
  status: string;
  first_wrong_at?: string;
  last_wrong_at?: string;
  next_review_at?: string;
  first_wrong_at_display?: string;
  last_wrong_at_display?: string;
  next_review_at_display?: string;
  lesson?: {
    grade?: string;
    volume?: string;
    unit?: string;
    title?: string;
  } | null;
  source_task?: {
    id: string;
    title: string;
  } | null;
}

export interface PronunciationEvaluation {
  id: string;
  provider: string;
  confidence: number;
  recognized_text: string;
  expected_pinyin: string;
  score: number;
  mastery: 'passed' | 'needs_practice' | 'weak';
  issues: string[];
  correction: string[];
}

export interface TaskReport {
  task: DictationTask;
  lesson?: {
    grade?: string;
    volume?: string;
    unit?: string;
    title?: string;
  };
  summary: {
    total_students: number;
    submitted_count: number;
    completion_rate: number;
    total_answers: number;
    correct_answers: number;
    accuracy: number;
    wrong_count: number;
    pending_review_count?: number;
  };
  top_mistakes: Array<{ item: string; count: number }>;
  top_chars: Array<{ item: string; count: number }>;
  top_words: Array<{ item: string; count: number }>;
  unit_mastery: Array<{
    item_id: string;
    order_no: number;
    item: string;
    question_type: string;
    difficulty: number;
    answered_count: number;
    correct_count: number;
    wrong_count: number;
    pending_review_count: number;
    accuracy: number;
  }>;
  mistake_types: Array<{ type: string; count: number }>;
  similar_shape_rank: Array<{ item: string; count: number }>;
  homophone_rank: Array<{ item: string; count: number }>;
  students: Array<{
    student_id: string;
    student_name: string;
    status: string;
    correct_count: number;
    total_count: number;
    wrong_count?: number;
    pending_review_count?: number;
    submitted_at?: string | null;
    accuracy: number;
    weak_words?: Array<{ item: string; count: number; types: string[] }>;
  }>;
  suggestions: Array<{
    target: string;
    focus: string;
    duration: string;
    activity: string;
    reason: string;
  }>;
}

export interface ReviewAnswer {
  id: string;
  submission_id: string;
  item_id: string;
  raw_answer: string;
  normalized_answer: string;
  recognized_text?: string;
  confidence?: number;
  result: string;
  mistake_type?: string;
  created_at: string;
  student: {
    id: string;
    name: string;
  };
  task: {
    id: string;
    title: string;
  };
  item: {
    id: string;
    item_type: string;
    prompt_text: string;
    answer: string;
    audio_text: string;
    order_no: number;
  };
}
