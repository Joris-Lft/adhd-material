import { useCallback, useEffect, useRef, useState } from "react";
import { ImagePlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PHOTO_LIMIT_IGNORED, PHOTO_PROCESS_FAILED, photoFormatMessage } from "@/lib/messages";
import { randomId } from "@/lib/random-id";
import { compressPhoto, isSupportedPhoto, MAX_PHOTOS, PhotoError, type PhotoItem } from "./photos";

interface PhotoFieldProps {
  value: PhotoItem[];
  onChange: (value: PhotoItem[]) => void;
  onBlur?: () => void;
  error?: string;
  /** Prévient le formulaire qu'une compression est en cours. */
  onBusyChange?: (busy: boolean) => void;
}

/** Aperçu : l'URL d'objet est créée et libérée avec l'élément (sûr en StrictMode). */
function Thumbnail({ file, alt }: { file: File; alt: string }) {
  const attach = useCallback(
    (img: HTMLImageElement) => {
      const url = URL.createObjectURL(file);
      img.src = url;
      return () => URL.revokeObjectURL(url);
    },
    [file],
  );
  return <img ref={attach} alt={alt} className="size-full object-cover" />;
}

export function PhotoField({ value, onChange, onBlur, error, onBusyChange }: PhotoFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const addRef = useRef<HTMLButtonElement>(null);
  const valueRef = useRef(value);
  const pendingRef = useRef(0);
  const [pending, setPending] = useState(0);
  const [problems, setProblems] = useState<string[]>([]);
  const refocusAdd = useRef(false);

  useEffect(() => {
    valueRef.current = value;
    if (refocusAdd.current) {
      refocusAdd.current = false;
      addRef.current?.focus();
    }
  }, [value]);
  useEffect(() => onBusyChange?.(pending > 0), [pending, onBusyChange]);

  /** Met la valeur courante à jour tout de suite : deux ajouts concurrents ne s'écrasent pas. */
  function commit(next: PhotoItem[]) {
    valueRef.current = next;
    onChange(next);
  }

  async function addFiles(files: File[]) {
    const messages: string[] = [];
    const slots = Math.max(MAX_PHOTOS - valueRef.current.length - pendingRef.current, 0);
    const kept = files.slice(0, slots);
    if (files.length > kept.length) messages.push(PHOTO_LIMIT_IGNORED);
    const valid = kept.filter((file) => {
      if (isSupportedPhoto(file)) return true;
      messages.push(photoFormatMessage(file.name));
      return false;
    });
    setProblems(messages.slice());

    pendingRef.current += valid.length;
    setPending(pendingRef.current);
    try {
      const results = await Promise.all(
        valid.map((file) =>
          compressPhoto(file).catch((e: unknown) => {
            if (e instanceof PhotoError) messages.push(e.message);
            return null;
          }),
        ),
      );
      const added = results.flatMap((file) => (file ? [{ id: randomId(), file }] : []));
      if (added.length > 0) commit([...valueRef.current, ...added]);
    } finally {
      pendingRef.current -= valid.length;
      setPending(pendingRef.current);
    }
    setProblems(messages.slice());
  }

  function remove(id: string) {
    setProblems([]);
    refocusAdd.current = true;
    commit(valueRef.current.filter((photo) => photo.id !== id));
  }

  const full = value.length + pending >= MAX_PHOTOS;
  const errorId = "listing-photos-error";
  const hintId = "listing-photos-hint";

  return (
    <fieldset
      id="listing-photos"
      tabIndex={-1}
      aria-describedby={[hintId, error ? errorId : null].filter(Boolean).join(" ")}
      className="space-y-3 rounded-md focus-ring"
    >
      <legend className="text-sm leading-none font-medium">Photos (1 à 3)</legend>
      <p id={hintId} className="text-sm text-muted-foreground">
        La première photo sert de couverture. Elles sont réduites automatiquement.
      </p>
      {value.length > 0 && (
        <ul className="grid grid-cols-3 gap-3">
          {value.map((photo, index) => (
            <li key={photo.id} className="space-y-2">
              <div className="relative aspect-square overflow-hidden rounded-md border bg-muted">
                <Thumbnail file={photo.file} alt={`Photo ${index + 1}`} />
                {index === 0 && (
                  <span className="absolute bottom-1 left-1 rounded bg-background/90 px-1.5 py-0.5 text-xs font-medium">
                    Couverture
                  </span>
                )}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full"
                aria-label={`Retirer la photo ${index + 1}`}
                onClick={() => remove(photo.id)}
              >
                <X aria-hidden="true" />
                Retirer
              </Button>
            </li>
          ))}
        </ul>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        hidden
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          event.target.value = "";
          if (files.length > 0) addFiles(files).catch(() => setProblems([PHOTO_PROCESS_FAILED]));
        }}
      />
      <Button
        ref={addRef}
        type="button"
        variant="outline"
        disabled={full}
        aria-invalid={error ? true : undefined}
        onClick={() => inputRef.current?.click()}
        onBlur={onBlur}
      >
        <ImagePlus aria-hidden="true" />
        {value.length === 0 ? "Ajouter des photos" : "Ajouter une photo"}
      </Button>
      {pending > 0 && (
        // Annoncé par la zone live permanente du formulaire.
        <p className="text-sm text-muted-foreground">Préparation des photos…</p>
      )}
      {problems.length > 0 && (
        <div role="alert" className="space-y-1 text-sm text-destructive">
          {problems.map((message, index) => (
            <p key={index}>{message}</p>
          ))}
        </div>
      )}
      {error && (
        <p id={errorId} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </fieldset>
  );
}
