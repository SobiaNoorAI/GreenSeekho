import React, { useState, useRef, useEffect } from 'react';
import { 
  Camera, 
  Leaf, 
  Info, 
  BookOpen, 
  Stethoscope, 
  AlertTriangle,
  GraduationCap,
  Loader2,
  X,
  Plus,
  FolderOpen,
  LogOut,
  User as UserIcon,
  Save,
  Trash2,
  ChevronRight,
  Filter
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { motion, AnimatePresence } from 'motion/react';
import { analyzePlantImage } from './services/geminiService';
import { cn } from './lib/utils';
import { auth, signInWithGoogle, logout, db } from './lib/firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { 
  collection, 
  addDoc, 
  query, 
  where, 
  onSnapshot, 
  serverTimestamp, 
  deleteDoc, 
  doc, 
  setDoc,
  getDoc,
  collectionGroup
} from 'firebase/firestore';

enum Page {
  HOME = 'home',
  HERBARIUM = 'herbarium',
  PORTAL = 'portal'
}

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [currentPage, setCurrentPage] = useState<Page>(Page.HOME);
  const [image, setImage] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error', message: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Firestore Data State
  const [specimens, setSpecimens] = useState<any[]>([]);
  const [folders, setFolders] = useState<any[]>([]);
  const [selectedFolder, setSelectedFolder] = useState<string>('All');
  const [showCreateFolderModal, setShowCreateFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderColor, setNewFolderColor] = useState('#2D5A27');

  const showNotification = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 3000);
  };

  const COLOR_PRESETS = [
    { name: 'Forest Green', value: '#2D5A27' },
    { name: 'Earth Brown', value: '#7B5E43' },
    { name: 'Leaf Yellow', value: '#D4AF37' },
    { name: 'Sage', value: '#8A9A5B' },
    { name: 'Clay', value: '#CC7722' },
  ];

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setUser(user);
      if (user) {
        // Create user profile if it doesn't exist
        const userRef = doc(db, 'users', user.uid);
        const userSnap = await getDoc(userRef);
        if (!userSnap.exists()) {
          try {
            await setDoc(userRef, {
              uid: user.uid,
              email: user.email,
              displayName: user.displayName,
              photoURL: user.photoURL,
              createdAt: serverTimestamp()
            });
          } catch (e) {
            handleFirestoreError(e, OperationType.WRITE, `users/${user.uid}`);
          }
        }
      } else {
        setSpecimens([]);
        setFolders([]);
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;

    const specimensQuery = query(collectionGroup(db, 'plants'), where('userId', '==', user.uid));
    const foldersQuery = query(collection(db, 'folders'), where('userId', '==', user.uid));

    const unsubSpecimens = onSnapshot(specimensQuery, (snapshot) => {
      setSpecimens(snapshot.docs.map(doc => ({ 
        id: doc.id, 
        ...doc.data(),
        // Get folderId from parent path if not in data
        folderId: doc.data().folderId || doc.ref.parent.parent?.id 
      })));
    }, (e) => handleFirestoreError(e, OperationType.LIST, 'collectionGroup:plants'));

    const unsubFolders = onSnapshot(foldersQuery, (snapshot) => {
      setFolders(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (e) => handleFirestoreError(e, OperationType.LIST, 'folders'));

    return () => {
      unsubSpecimens();
      unsubFolders();
    };
  }, [user]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  const handleLogin = async () => {
    if (isLoggingIn) return;
    setError(null);
    setIsLoggingIn(true);
    try {
      await signInWithGoogle();
    } catch (err: any) {
      if (err.code === 'auth/popup-closed-by-user' || err.code === 'auth/cancelled-popup-request') {
        return;
      }
      setError("Authentication failed. Please check if popups are enabled for this site.");
      console.error("Auth Error:", err);
    } finally {
      setIsLoggingIn(false);
    }
  };

  const processFile = (file: File) => {
    if (!file.type.startsWith('image/')) {
      setError("Please select a valid image file.");
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const base64 = e.target?.result as string;
      setImage(base64);
      setResult(null);
      setError(null);
      analyze(base64, file.type);
    };
    reader.readAsDataURL(file);
  };

  const analyze = async (base64: string, mimeType: string) => {
    setIsAnalyzing(true);
    try {
      const base64Data = base64.split(',')[1];
      const response = await analyzePlantImage(base64Data, mimeType);
      setResult(response || "No data returned.");
    } catch (err: any) {
      setError(err.message || "An error occurred during analysis.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const saveSpecimen = async () => {
    if (!user || !result || !image) return;
    
    const folderId = selectedFolder === 'All' ? null : selectedFolder;
    if (!folderId) {
      showNotification('error', "Please select a folder first");
      return;
    }

    setIsSaving(true);
    try {
      const plantName = result.match(/🌿 \[(.*?)\]/)?.[1] || "Unknown Plant";
      const scientificName = result.match(/\((.*?)\)/)?.[1] || "Unknown Species";
      const family = result.match(/Family:\s*(.*)/)?.[1] || "Unknown";
      const growingSeason = result.match(/🗓️ Season:\s*([^|\n]*)/)?.[1]?.trim() || "Unknown";
      const usesMatch = result.match(/🏥 Benefits & Uses:\s*([\s\S]*?)(?=\n\n⚠️|$)/);
      const uses = usesMatch ? usesMatch[1].trim().split('\n')[0].replace(/^- /, '') : "Multiple historical & medicinal uses";
      
      const targetFolderName = folders.find(f => f.id === folderId)?.name || 'Research Folder';

      await addDoc(collection(db, 'folders', folderId, 'plants'), {
        userId: user.uid,
        plantName,
        scientificName,
        family,
        growingSeason,
        uses,
        imageUrl: image,
        analysis: result,
        folderId: folderId,
        createdAt: serverTimestamp()
      });
      showNotification('success', `Saved to ${targetFolderName}`);
    } catch (e) {
      console.error("Save Specimen Error:", e);
      showNotification('error', "Failed to save specimen");
      handleFirestoreError(e, OperationType.CREATE, `folders/${folderId}/plants`);
    } finally {
      setIsSaving(false);
    }
  };

  const deleteSpecimen = async (id: string, folderId: string) => {
    if (!confirm("Are you sure you want to remove this record?")) return;
    try {
      await deleteDoc(doc(db, 'folders', folderId, 'plants', id));
      showNotification('success', "Record removed");
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, `folders/${folderId}/plants/${id}`);
    }
  };

  const createFolder = async () => {
    if (!user || !newFolderName.trim()) return;
    setIsSaving(true);
    try {
      await addDoc(collection(db, 'folders'), {
        userId: user.uid,
        name: newFolderName.trim(),
        color: newFolderColor,
        createdAt: serverTimestamp()
      });
      setNewFolderName('');
      setShowCreateFolderModal(false);
      showNotification('success', "Folder Created");
    } catch (e) {
      showNotification('error', "Failed to create folder");
      handleFirestoreError(e, OperationType.CREATE, 'folders');
    } finally {
      setIsSaving(false);
    }
  };

  const reset = () => {
    setImage(null);
    setResult(null);
    setError(null);
    setSelectedFolder('All');
  };

  const filteredSpecimens = specimens.filter(s => 
    selectedFolder === 'All' || s.folderId === selectedFolder
  );

  return (
    <div className="min-h-screen flex flex-col font-sans">
      {/* Notifications */}
      <AnimatePresence>
        {notification && (
          <motion.div 
            initial={{ opacity: 0, y: -20, x: '-50%' }}
            animate={{ opacity: 1, y: 20, x: '-50%' }}
            exit={{ opacity: 0, y: -20, x: '-50%' }}
            className={cn(
              "fixed top-4 left-1/2 -translate-x-1/2 z-[200] px-6 py-3 rounded-full flex items-center gap-3 shadow-2xl border",
              notification.type === 'success' ? "bg-brand-muted text-white border-brand-primary" : "bg-red-500 text-white border-red-600"
            )}
          >
            {notification.type === 'success' ? <Plus className="w-4 h-4 rotate-45" /> : <AlertTriangle className="w-4 h-4" />}
            <span className="text-[10px] uppercase tracking-widest font-bold">{notification.message}</span>
          </motion.div>
        )}
      </AnimatePresence>

      <header className="border-b border-brand-border bg-brand-bg/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 md:px-10 h-20 flex items-center justify-between">
          <button 
            onClick={() => setCurrentPage(Page.HOME)}
            className="flex items-center gap-3 hover:opacity-80 transition-opacity"
          >
            <div className="w-8 h-8 bg-brand-muted rounded-full flex items-center justify-center text-brand-bg font-serif italic text-xl">G</div>
            <span className="text-sm font-bold tracking-widest uppercase text-brand-muted">GreenSeekho <span className="font-light opacity-50 block sm:inline">| AISeekho</span></span>
          </button>
          
          <nav className="hidden md:flex items-center gap-8 text-[11px] uppercase tracking-[0.2em] font-semibold text-brand-primary">
            <button 
              onClick={() => setCurrentPage(Page.HOME)}
              className={cn("transition-all", currentPage === Page.HOME ? "text-brand-muted border-b border-brand-muted" : "opacity-60 hover:opacity-100")}
            >
              Encyclopedia
            </button>
            <button 
              onClick={() => setCurrentPage(Page.HERBARIUM)}
              className={cn("transition-all", currentPage === Page.HERBARIUM ? "text-brand-muted border-b border-brand-muted" : "opacity-60 hover:opacity-100")}
            >
              Herbarium
            </button>
            <button 
              onClick={() => setCurrentPage(Page.PORTAL)}
              className={cn("transition-all flex items-center gap-2", currentPage === Page.PORTAL ? "text-brand-muted border-b border-brand-muted" : "opacity-60 hover:opacity-100")}
            >
              {user ? <UserIcon className="w-3 h-3" /> : <GraduationCap className="w-3 h-3" />}
              {user ? 'My Portal' : 'Student Portal'}
            </button>
          </nav>

          <div className="md:hidden flex items-center gap-4">
             {user && (
               <img src={user.photoURL || ''} className="w-8 h-8 rounded-full border border-brand-border" alt="" />
             )}
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full px-6 md:px-10 py-8 md:py-12">
        <AnimatePresence mode="wait">
          {currentPage === Page.HOME && (
            <motion.div 
              key="home"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="grid grid-cols-1 lg:grid-cols-12 gap-8 md:gap-12 items-start"
            >
              <section className="lg:col-span-5 space-y-8">
                <div 
                  className={cn(
                    "relative group aspect-square rounded-[40px] border border-brand-border bg-brand-accent transition-all overflow-hidden flex flex-col items-center justify-center",
                    !image && "hover:bg-brand-accent/70 cursor-pointer",
                    image && "shadow-xl"
                  )}
                  onClick={() => !image && fileInputRef.current?.click()}
                >
                  <input type="file" className="hidden" ref={fileInputRef} onChange={handleFileChange} accept="image/*" />
                  <AnimatePresence mode="wait">
                    {!image ? (
                      <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center p-8 space-y-6">
                        <div className="opacity-10 absolute inset-0 p-6 pointer-events-none">
                          <div className="w-full h-full border-2 border-dashed border-brand-muted rounded-[30px]"></div>
                        </div>
                        <div className="space-y-2">
                          <span className="block font-serif italic text-4xl text-brand-primary leading-tight opacity-20">Discover<br />Species</span>
                          <div className="inline-block px-4 py-1 rounded-full bg-brand-muted text-brand-bg text-[10px] uppercase tracking-widest mt-4">Click to Begin Analysis</div>
                        </div>
                      </motion.div>
                    ) : (
                      <motion.div key="image" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute inset-0 w-full h-full">
                        <img src={image} alt="Specimen" className="w-full h-full object-cover" />
                        <div className="absolute inset-x-0 bottom-0 p-6 bg-gradient-to-t from-brand-primary/60 to-transparent flex flex-col gap-3">
                          {result && user && (
                            <div className="flex gap-2">
                              <div className="flex-1 bg-white/20 backdrop-blur-md border border-white/30 rounded-full px-4 flex items-center">
                                <Filter className="w-3 h-3 text-white mr-2" />
                                <select 
                                  value={selectedFolder}
                                  onChange={(e) => setSelectedFolder(e.target.value)}
                                  className="bg-transparent text-white text-[9px] uppercase tracking-widest font-bold outline-none border-none w-full"
                                >
                                  <option value="All" disabled className="text-brand-primary">Select Folder...</option>
                                  {folders.map(f => <option key={f.id} value={f.id} className="text-brand-primary">{f.name}</option>)}
                                </select>
                              </div>
                              <button 
                                onClick={(e) => { e.stopPropagation(); saveSpecimen(); }}
                                disabled={isSaving || selectedFolder === 'All'}
                                className={cn(
                                  "rounded-full px-4 py-2 text-[10px] uppercase tracking-widest flex items-center gap-2 transition-all whitespace-nowrap",
                                  selectedFolder === 'All' 
                                    ? "bg-white/20 text-white/50 cursor-not-allowed border border-white/10" 
                                    : "bg-brand-muted text-white hover:bg-brand-primary shadow-lg"
                                )}
                              >
                                <Save className="w-3 h-3" /> 
                                {selectedFolder === 'All' ? 'Select Folder first' : 'Save Analysis'}
                              </button>
                            </div>
                          )}
                          <div className="flex justify-between items-center">
                            <button onClick={(e) => { e.stopPropagation(); reset(); }} className="bg-white/20 hover:bg-white/40 backdrop-blur-md text-white border border-white/30 rounded-full px-4 py-2 text-[10px] uppercase tracking-widest">New Specimen</button>
                          </div>
                        </div>
                        {isAnalyzing && (
                          <div className="absolute inset-0 bg-brand-bg/60 backdrop-blur-[4px] flex items-center justify-center">
                            <div className="text-center space-y-4">
                              <Loader2 className="w-10 h-10 text-brand-muted animate-spin mx-auto" />
                              <p className="font-serif italic text-xl text-brand-primary">Analyzing Taxonomy...</p>
                            </div>
                          </div>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                <div className="bg-white p-8 rounded-[24px] border border-brand-border shadow-sm">
                  <div className="flex items-center gap-3 mb-4">
                    <GraduationCap className="w-5 h-5 text-brand-muted" />
                    <h3 className="caps-label">System Insights</h3>
                  </div>
                  <p className="text-sm italic leading-relaxed text-brand-muted/80">
                    Our AI models are optimized for botanical classification, factoring in leaf venation, floral morphology, and serration patterns.
                  </p>
                </div>
              </section>

              <section className="lg:col-span-7 flex flex-col min-h-[500px]">
                <div className="flex-1">
                  <AnimatePresence mode="wait">
                    {!image && !result ? (
                      <motion.div key="welcome" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="h-full flex flex-col justify-center space-y-10">
                        <h1 className="text-6xl font-serif text-brand-primary leading-tight">Green <br /><span className="italic">Seekho</span> System</h1>
                        <p className="text-brand-muted text-lg max-w-lg leading-relaxed">Scientific flora identification platform for students and ethnobotanists.</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                          <div className="glass-card p-6 aspect-square flex flex-col justify-between">
                            <BookOpen className="w-6 h-6 text-brand-muted" />
                            <h4 className="caps-label">Taxonomy</h4>
                          </div>
                          <div className="glass-card p-6 aspect-square flex flex-col justify-between">
                            <Stethoscope className="w-6 h-6 text-brand-muted" />
                            <h4 className="caps-label">Utility</h4>
                          </div>
                        </div>
                      </motion.div>
                    ) : result ? (
                      <motion.div key="result" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                        <div className="markdown-body">
                          <ReactMarkdown>{result}</ReactMarkdown>
                        </div>
                      </motion.div>
                    ) : isAnalyzing ? (
                      <div className="space-y-12 py-10">
                        <div className="h-10 w-2/3 bg-brand-accent rounded-lg animate-pulse" />
                        <div className="h-40 w-full bg-brand-accent/20 rounded-[32px] animate-pulse" />
                      </div>
                    ) : null}
                  </AnimatePresence>
                </div>
              </section>
            </motion.div>
          )}

          {currentPage === Page.HERBARIUM && (
            <motion.div 
              key="herbarium"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-10"
            >
              <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
                <div>
                  <h1 className="text-5xl font-serif text-brand-primary mb-2">The Herbarium</h1>
                  <p className="text-brand-muted tracking-wide">A digital conservatory of your identified specimens.</p>
                </div>
                <div className="flex items-center gap-4 bg-white p-2 border border-brand-border rounded-full pr-6">
                  <div className="bg-brand-muted p-2 rounded-full text-white">
                    <Filter className="w-4 h-4" />
                  </div>
                  <select 
                    value={selectedFolder}
                    onChange={(e) => setSelectedFolder(e.target.value)}
                    className="bg-transparent text-[11px] uppercase tracking-widest font-bold outline-none border-none"
                  >
                    <option value="All">All Collections</option>
                    {folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                  </select>
                </div>
              </div>

              {!user ? (
                <div className="h-[400px] glass-card flex flex-col items-center justify-center text-center p-8 space-y-6">
                  <div className="w-16 h-16 bg-brand-accent rounded-full flex items-center justify-center">
                    <LogOut className="w-8 h-8 text-brand-muted opacity-50" />
                  </div>
                  <div className="space-y-2">
                    <h3 className="font-serif text-2xl">Restricted Access</h3>
                    <p className="text-brand-muted max-w-sm">Please sign in to the Student Portal to access and build your personal herbarium.</p>
                  </div>
                  <button onClick={() => setCurrentPage(Page.PORTAL)} className="px-8 py-3 bg-brand-primary text-white rounded-full text-xs uppercase tracking-widest font-bold">Access Portal</button>
                </div>
              ) : filteredSpecimens.length === 0 ? (
                <div className="h-[400px] glass-card flex flex-col items-center justify-center text-center p-8 space-y-6">
                  <Leaf className="w-12 h-12 text-brand-muted opacity-20" />
                  <p className="text-brand-muted">No specimens found in this collection.</p>
                  <button onClick={() => setCurrentPage(Page.HOME)} className="text-brand-muted underline decoration-brand-border text-[11px] uppercase tracking-widest font-bold">Start Identification</button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                  {filteredSpecimens.map((specimen) => (
                    <motion.div 
                      key={specimen.id}
                      layout
                      className="glass-card overflow-hidden group hover:border-brand-muted transition-all"
                    >
                      <div className="aspect-[4/3] relative overflow-hidden">
                        <img src={specimen.imageUrl} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" alt="" />
                        <div className="absolute inset-x-0 top-0 p-4 flex justify-between items-start">
                           <span className="bg-brand-primary/80 backdrop-blur-md text-[8px] text-white px-2 py-1 rounded uppercase tracking-widest">
                             {folders.find(f => f.id === specimen.folderId)?.name || 'General'}
                           </span>
                           <button 
                            onClick={() => deleteSpecimen(specimen.id, specimen.folderId)}
                            className="p-2 bg-white/20 hover:bg-red-500/80 backdrop-blur-md text-white rounded-full opacity-0 group-hover:opacity-100 transition-all shadow-xl"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                      <div className="p-6 space-y-3">
                        <div>
                          <h3 className="font-serif text-xl text-brand-primary">{specimen.plantName || specimen.commonName || 'Unknown Specimen'}</h3>
                          <p className="text-[10px] text-brand-muted italic font-serif">({specimen.scientificName || 'Unknown Species'})</p>
                        </div>
                        
                        {(specimen.family || specimen.growingSeason || specimen.uses) && (
                          <div className="space-y-2 py-2 border-y border-brand-border/50">
                            {specimen.family && (
                              <div className="flex justify-between text-[9px] uppercase tracking-wider">
                                <span className="text-brand-muted">Family</span>
                                <span className="font-bold text-brand-primary">{specimen.family}</span>
                              </div>
                            )}
                            {specimen.growingSeason && (
                              <div className="flex justify-between text-[9px] uppercase tracking-wider">
                                <span className="text-brand-muted">Season</span>
                                <span className="font-bold text-brand-primary">{specimen.growingSeason}</span>
                              </div>
                            )}
                            {specimen.uses && (
                              <div className="text-[10px] text-brand-muted line-clamp-2 italic leading-relaxed">
                                "{specimen.uses}"
                              </div>
                            )}
                          </div>
                        )}

                        <button 
                          onClick={() => {
                            setResult(specimen.analysis);
                            setImage(specimen.imageUrl);
                            setCurrentPage(Page.HOME);
                          }}
                          className="w-full py-2 border border-brand-border rounded-full text-[10px] uppercase tracking-widest font-bold group-hover:bg-brand-accent transition-colors"
                        >
                          View Full Analysis
                        </button>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {currentPage === Page.PORTAL && (
            <motion.div 
              key="portal"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              className="max-w-3xl mx-auto py-10"
            >
              {!user ? (
                <div className="glass-card p-12 text-center space-y-10">
                  <div className="space-y-4">
                    <h1 className="text-5xl font-serif text-brand-primary">Student Portal</h1>
                    <p className="text-brand-muted text-lg">Join the AISeekho community to save your field research and specimens.</p>
                  </div>
                  
                  <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                    <button 
                      onClick={handleLogin}
                      disabled={isLoggingIn}
                      className="w-full sm:w-auto flex items-center justify-center gap-4 px-10 py-4 bg-brand-primary text-white rounded-full hover:bg-brand-muted transition-all shadow-lg active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isLoggingIn ? <Loader2 className="w-5 h-5 animate-spin" /> : <UserIcon className="w-5 h-5" />}
                      <span className="font-bold text-xs uppercase tracking-widest">{isLoggingIn ? 'Connecting...' : 'Sign In'}</span>
                    </button>
                    <button 
                      onClick={handleLogin}
                      disabled={isLoggingIn}
                      className="w-full sm:w-auto flex items-center justify-center gap-4 px-10 py-4 border-2 border-brand-primary text-brand-primary rounded-full hover:bg-brand-accent transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Plus className="w-5 h-5" />
                      <span className="font-bold text-xs uppercase tracking-widest">Sign Up</span>
                    </button>
                  </div>
                  
                  <p className="text-[10px] uppercase tracking-widest text-brand-muted font-bold">
                    Secure authentication via Google <br />
                    <span className="opacity-50 font-normal mt-2 block">No separate password required</span>
                  </p>
                </div>
              ) : (
                <div className="space-y-12">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-6">
                      <img src={user.photoURL || ''} className="w-20 h-20 rounded-[30px] border-2 border-brand-muted p-1" alt="" />
                      <div>
                        <h2 className="text-3xl font-serif text-brand-primary">{user.displayName}</h2>
                        <p className="text-brand-muted text-sm">{user.email}</p>
                      </div>
                    </div>
                    <button onClick={logout} className="p-3 border border-brand-border rounded-full hover:bg-red-50 transition-colors text-brand-muted hover:text-red-500">
                      <LogOut className="w-5 h-5" />
                    </button>
                  </div>

                  <div className="space-y-6">
                    <div className="flex items-center justify-between">
                      <h3 className="caps-label">Research Folders</h3>
                      <button 
                        onClick={() => setShowCreateFolderModal(true)} 
                        className="flex items-center gap-2 text-[10px] uppercase tracking-widest font-bold text-brand-muted hover:text-brand-primary transition-colors"
                      >
                        <Plus className="w-3 h-3" /> New Folder
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {folders.length === 0 ? (
                        <div className="col-span-2 glass-card p-10 text-center text-brand-muted text-sm italic">
                          No research folders created yet.
                        </div>
                      ) : (
                        folders.map((folder) => (
                          <div key={folder.id} className="glass-card p-6 flex items-center justify-between group hover:border-brand-muted">
                            <div className="flex items-center gap-4">
                              <div 
                                className="w-10 h-10 rounded-xl flex items-center justify-center transition-transform group-hover:scale-110"
                                style={{ backgroundColor: `${folder.color}20`, color: folder.color }}
                              >
                                <FolderOpen className="w-5 h-5" />
                              </div>
                              <div>
                                <h4 className="font-bold text-brand-primary text-sm">{folder.name}</h4>
                                <p className="text-[10px] text-brand-muted uppercase">
                                  {specimens.filter(s => s.folderId === folder.id).length} Specimens
                                </p>
                              </div>
                            </div>
                            <button 
                              onClick={() => { setSelectedFolder(folder.id); setCurrentPage(Page.HERBARIUM); }}
                              className="p-2 opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <ChevronRight className="w-4 h-4 text-brand-muted" />
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* New Folder Creation Modal */}
      <AnimatePresence>
        {showCreateFolderModal && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-brand-primary/40 backdrop-blur-md z-[110] flex items-center justify-center p-6"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="bg-brand-bg w-full max-w-sm rounded-[32px] p-8 space-y-8 shadow-2xl border border-brand-border"
            >
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <div className="w-1 h-6 bg-brand-muted rounded-full" />
                  <h3 className="caps-label">Create Folder</h3>
                </div>
                <button onClick={() => setShowCreateFolderModal(false)} className="opacity-40 hover:opacity-100 transition-all"><X className="w-5 h-5" /></button>
              </div>

              <div className="space-y-6">
                <div className="space-y-2">
                  <label className="text-[10px] uppercase tracking-widest font-bold text-brand-muted">Folder Name</label>
                  <input 
                    type="text" 
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    placeholder="e.g., Medicinal Plants"
                    className="w-full bg-white border border-brand-border rounded-2xl px-5 py-4 text-sm focus:outline-none focus:ring-2 focus:ring-brand-muted/20 focus:border-brand-muted transition-all"
                    autoFocus
                  />
                </div>

                <div className="space-y-3">
                  <label className="text-[10px] uppercase tracking-widest font-bold text-brand-muted">Thematic Color</label>
                  <div className="grid grid-cols-5 gap-3">
                    {COLOR_PRESETS.map((color) => (
                      <button
                        key={color.value}
                        onClick={() => setNewFolderColor(color.value)}
                        className={cn(
                          "aspect-square rounded-full transition-all border-2",
                          newFolderColor === color.value ? "border-brand-primary scale-110 shadow-lg" : "border-transparent scale-100 opacity-60 hover:opacity-100"
                        )}
                        style={{ backgroundColor: color.value }}
                        title={color.name}
                      />
                    ))}
                  </div>
                </div>
              </div>

              <button 
                onClick={createFolder}
                disabled={!newFolderName.trim() || isSaving}
                className="w-full py-5 bg-brand-primary text-white rounded-[20px] text-[11px] uppercase tracking-[0.2em] font-bold hover:bg-brand-muted transition-all shadow-xl disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3"
              >
                {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                {isSaving ? 'Assembling...' : 'Assemble Collection'}
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <footer className="mt-12 py-10 border-t border-brand-border opacity-60">
        <div className="max-w-7xl mx-auto px-10 flex flex-col md:flex-row items-center justify-between gap-4">
           <p className="text-[9px] uppercase tracking-[0.2em] font-bold">Analysis Engine v2.4.0 • Enterprise Edition</p>
           <p className="text-[9px] uppercase tracking-[0.2em] font-bold">© 2026 AISeekho Initiative</p>
        </div>
      </footer>
    </div>
  );
}
