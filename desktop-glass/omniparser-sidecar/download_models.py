#!/usr/bin/env python3
"""Download OmniParser v2 weights from Hugging Face."""

from __future__ import annotations

import argparse

from model_assets import download_caption_weights, download_detection_weights, models_dir


def main() -> None:
    parser = argparse.ArgumentParser(description="Download OmniParser v2 model weights")
    parser.add_argument("--detection", action="store_true", help="Download YOLO icon detection weights")
    parser.add_argument("--caption", action="store_true", help="Download Florence caption weights")
    parser.add_argument("--force", action="store_true", help="Re-download even if present")
    args = parser.parse_args()

    if not args.detection and not args.caption:
        args.detection = True

    print(f"Models directory: {models_dir()}")

    if args.detection:
        path = download_detection_weights(force=args.force)
        print(f"Detection weights: {path}")

    if args.caption:
        path = download_caption_weights(force=args.force)
        print(f"Caption weights: {path}")


if __name__ == "__main__":
    main()
