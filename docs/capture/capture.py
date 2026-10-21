"""Regenerates the screenshots and demo GIF in docs/img (run via docs/capture/run.sh)."""
import io
import os
import sys
import time

from PIL import Image
from playwright.sync_api import sync_playwright

BASE = os.environ.get("BASE_URL", "http://localhost:5173")  # Vite rejects foreign Host headers; we map localhost → host below
OUT = "/out"

HCL_STEPS = [
    # (caption, code appended)
    ('resource "aws_vpc" "core" {\n  cidr_block = "10.0.0.0/16"\n  tags = { Name = "Core VPC" }\n}\n\n'
     'resource "aws_subnet" "app" {\n  vpc_id     = aws_vpc.core.id\n  cidr_block = "10.0.1.0/24"\n  tags = { Name = "App Subnet" }\n}\n'),
    ('\nresource "aws_instance" "web" {\n  subnet_id     = aws_subnet.app.id\n  instance_type = "t3.small"\n  tags = { Name = "Web Server" }\n}\n'),
    ('\nresource "aws_db_instance" "db" {\n  engine         = "postgres"\n  instance_class = "db.t3.medium"\n  tags = { Name = "Orders DB" }\n}\n'),
    ('\nresource "azurerm_resource_group" "rg" {\n  name     = "rg-analytics"\n  location = "eastus"\n}\n\n'
     'resource "google_storage_bucket" "lake" {\n  name     = "analytics-lake"\n  location = "US"\n}\n\n'
     'resource "oci_core_vcn" "edge" {\n  display_name   = "edge"\n  cidr_blocks    = ["10.3.0.0/16"]\n  compartment_id = var.compartment_ocid\n}\n'),
]


def set_code(page, text):
    page.evaluate(
        """(code) => {
            const ta = document.querySelector('aside textarea');
            Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(ta, code);
            ta.dispatchEvent(new Event('input', { bubbles: true }));
        }""", text)


def click_text(page, selector, pattern):
    page.evaluate(
        """([sel, pat]) => { const re = new RegExp(pat, 'i');
            const el = [...document.querySelectorAll(sel)].find(b => re.test(b.innerText) || re.test(b.title || ''));
            if (!el) throw new Error('not found: ' + pat); el.click(); }""", [selector, pattern])


def shot(page, name):
    page.screenshot(path=f"{OUT}/{name}.png")
    print("saved", name)


with sync_playwright() as p:
    browser = p.chromium.launch(args=["--host-resolver-rules=MAP localhost host.docker.internal"])
    ctx = browser.new_context(viewport={"width": 1440, "height": 900}, device_scale_factor=1.5)
    page = ctx.new_page()
    page.goto(BASE)
    page.wait_for_selector("text=Organize", timeout=30000)
    time.sleep(2.5)

    # 1-3. wide viewport so the whole demo graph is visible (cards keep a fixed pixel size)
    wide = browser.new_context(viewport={"width": 2400, "height": 1200}, device_scale_factor=1)
    wp = wide.new_page()
    wp.goto(BASE)
    wp.wait_for_selector("text=Organize", timeout=30000)
    time.sleep(2.5)
    click_text(wp, "button", "Organize")
    time.sleep(2.2)
    wp.screenshot(path=f"{OUT}/map.png")
    print("saved map")

    box = wp.locator("text=EKS Worker Nodes").first.bounding_box()
    if box:
        wp.mouse.click(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)
        time.sleep(2)
        wp.screenshot(path=f"{OUT}/analysis.png")
        print("saved analysis")
        wp.mouse.click(60, 600)  # empty canvas → close the panel
        time.sleep(1)

    click_text(wp, "button", "^[🌙☀️]")
    time.sleep(1.5)
    wp.screenshot(path=f"{OUT}/map-dark.png")
    print("saved map-dark")
    wide.close()

    # 4. draft mode palette (multi-cloud)
    click_text(page, "button", "DRAFT")
    time.sleep(1.5)
    page.fill("input[placeholder^='Search AWS']", "bucket")
    time.sleep(0.8)
    shot(page, "palette")
    page.fill("input[placeholder^='Search AWS']", "")

    # 5. IaC studio: progressive code → canvas (GIF frames)
    click_text(page, "button", "^IaC Studio")
    time.sleep(1.2)
    ctx2 = None
    frames = []
    code = ""
    for i, chunk in enumerate(HCL_STEPS):
        code += chunk
        set_code(page, code)
        time.sleep(3.2)
        if i == 0:
            click_text(page, "button", "Organize")
        png = page.screenshot()
        frames.append(Image.open(io.BytesIO(png)).convert("RGB"))
        if i == len(HCL_STEPS) - 1:
            click_text(page, "button", "Organize")
            time.sleep(2)
            shot(page, "studio-code")
    # extra settle frame
    frames.append(Image.open(io.BytesIO(page.screenshot())).convert("RGB"))

    for tab, name in [("Variables", "studio-variables"), ("Governance", "studio-governance"),
                      ("Deploy", "studio-deploy"), ("Team", "studio-team")]:
        click_text(page, "aside button", f"^{tab}")
        time.sleep(1.8)
        shot(page, name)

    # GIF: downscale frames
    small = [f.resize((960, 600), Image.LANCZOS) for f in frames]
    small[0].save(f"{OUT}/demo.gif", save_all=True, append_images=small[1:], duration=1700, loop=0, optimize=True)
    print("saved demo.gif", len(small), "frames")
    browser.close()
