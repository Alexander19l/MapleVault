export interface ChatResponse {
  text: string;
  message?: string;
  visualData?: {
    type: string;
    data: any;
  };
  visual_data?: {
    type: string;
    data: any;
  };
  action?: {
    type: string;
    data: any;
    confirmMessage: string;
    confirmToken?: string;
  };
}
